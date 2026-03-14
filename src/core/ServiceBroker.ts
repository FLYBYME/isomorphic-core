import { IServiceBroker } from '../interfaces/IServiceBroker';
import { IMeshApp } from '../interfaces/IMeshApp';
import { MeshNetwork, MeshPacket } from 'isomorphic-mesh';
import { ServiceRegistry, Context, MeshActionRegistry, MeshEventRegistry, IMeshTransceiver } from 'isomorphic-registry';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { MeshTokenManager, Gatekeeper } from 'isomorphic-auth';
import { ILogger } from '../types/core.types';
import { ContextStack } from './ContextStack';

/**
 * Metadata for local actions.
 */
interface LocalAction {
    handler: (ctx: Context<unknown>) => Promise<unknown>;
    highSecurity?: boolean;
}

/**
 * Runtime Action Registry for Zod validation.
 */
export const MeshActionSchemaRegistry: Map<string, { params: z.ZodTypeAny, returns: z.ZodTypeAny }> = new Map();

/**
 * ServiceBroker — The "OS Kernel" that routes requests locally or remotely.
 * Includes middleware for security and validation.
 */
export class ServiceBroker implements IServiceBroker {
    private localServices = new Map<string, LocalAction>();
    private middleware: ((ctx: Context<unknown>, next: () => Promise<unknown>) => Promise<unknown>)[] = [];
    private logger: ILogger;
    public pendingCalls = 0;

    constructor(
        private app: IMeshApp,
        private network: MeshNetwork,
        private registry: ServiceRegistry
    ) { 
        this.logger = app.getProvider<ILogger>('logger') || app.logger;
    }

    public use(mw: (ctx: Context<unknown>, next: () => Promise<unknown>) => Promise<unknown>): void {
        this.middleware.push(mw);
    }

    /**
     * Retrieves the active execution context for the current operation.
     */
    public getContext(): Context<unknown> | undefined {
        return ContextStack.getContext() as Context<unknown> | undefined;
    }

    /**
     * Registers a service instance and maps its methods to actions.
     */
    public registerService(service: any): void {
        const serviceName = service.name || service.constructor.name.replace('Service', '').toLowerCase();
        
        const prototype = Object.getPrototypeOf(service);
        const methods = Object.getOwnPropertyNames(prototype);

        // Check for actions in schema if available (standard Triad pattern)
        const schemaActions = service.schema?.actions || service.actions || {};

        for (const method of methods) {
            if (method === 'constructor' || method.startsWith('_')) continue;
            
            const handler = service[method];
            if (typeof handler === 'function') {
                const actionName = `${serviceName}.${method}`;
                this.logger.debug(`Registering local action: ${actionName}`);
                
                const metadata = schemaActions[method] || {};
                this.localServices.set(actionName, {
                    handler: (handler as Function).bind(service),
                    highSecurity: metadata.highSecurity === true
                });
            }
        }
    }

    public async call<
        TAction extends keyof MeshActionRegistry, 
        TParams extends MeshActionRegistry[TAction] extends { params: infer P } ? P : any,
        TReturn extends MeshActionRegistry[TAction] extends { returns: infer R } ? R : any
    >(action: TAction, params: TParams): Promise<TReturn> {
        const actionName = action as string;

        // 1. Zod Validation (Pre-execution)
        const schema = MeshActionSchemaRegistry.get(actionName);
        if (schema) {
            try {
                params = schema.params.parse(params);
            } catch (err: any) {
                this.logger.error(`Validation failed for action: ${actionName}`, { errors: err.errors });
                throw new Error(`[ServiceBroker] Validation failed for action: ${actionName}: ${JSON.stringify(err.errors)}`);
            }
        }

        // 2. Optimization: Check local first if feasible, or use registry
        // Lazy Loading: Retry if not found immediately (helpful during boot)
        let targetNode = this.registry.selectNode(actionName, { action: actionName, params });
        
        if (!targetNode && this.localServices.has(actionName)) {
            // It's local but maybe not yet in registry
            return await this.executeLocal(actionName, params, {}) as TReturn;
        }

        if (!targetNode) {
            // Lazy Load wait: 2s max
            for (let i = 0; i < 4; i++) {
                await new Promise(r => setTimeout(r, 500));
                targetNode = this.registry.selectNode(actionName, { action: actionName, params });
                if (targetNode) break;
            }
        }

        if (!targetNode) {
            throw new Error(`[ServiceBroker] No node found for action: ${actionName}`);
        }

        // 3. Local or Remote?
        let result: unknown;
        if (targetNode.nodeID === this.app.nodeID) {
            result = await this.executeLocal(actionName, params, {});
        } else {
            this.pendingCalls++;
            try {
                result = await this.executeRemote(targetNode.nodeID, actionName, params, {});
            } finally {
                this.pendingCalls--;
            }
        }

        // 4. Zod Validation (Post-execution)
        if (schema) {
            result = schema.returns.parse(result);
        }

        return result as TReturn;
    }

    public emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void {
        const eventName = event as string;
        this.network.publish(eventName, payload as Record<string, unknown>);
    }

    public on(event: string, handler: (payload: unknown) => void): (() => void) {
        this.network.onMessage(event, handler);
        return () => this.off(event, handler);
    }

    public off(event: string, handler: (payload: unknown) => void): void {
        (this.network.dispatcher as any).off(event, handler);
    }

    public async handleIncomingRPC(packet: unknown): Promise<unknown> {
        const { topic, data, meta = {} } = packet as { topic: string, data: unknown, meta: Record<string, unknown> };
        
        let userMeta: Record<string, unknown> = {};
        if (meta.token) {
            try {
                const gatekeeper = this.app.getProvider<Gatekeeper>('auth:gatekeeper');
                const decoded = await gatekeeper.verifyServiceTicket(meta.token as string);
                
                if (decoded) {
                    userMeta = {
                        id: decoded.sub,
                        groups: decoded.capabilities || [],
                        type: decoded.type,
                        tenant_id: decoded.tenant_id
                    };

                    // High Security PAC Check
                    const localAction = this.localServices.get(topic);
                    if (localAction?.highSecurity) {
                        this.logger.info(`[Gatekeeper] High-security action detected: ${topic}. Performing real-time PAC check-back...`);
                        const isValid = await gatekeeper.checkPAC(decoded.sub, (a: string, p: unknown) => this.call(a as any, p as any));
                        if (!isValid) {
                            throw new Error(`[Gatekeeper] Real-time PAC check failed for ${decoded.sub}. Access denied.`);
                        }
                    }
                } else {
                    throw new Error('[Gatekeeper] Invalid or expired service ticket.');
                }
            } catch (err: any) {
                this.logger.error(`[ServiceBroker] Security blockage: ${err.message}`);
                throw err;
            }
        } else {
            // No token provided - block if it's not a public action?
            // For now, we'll assume it's okay unless it's a protected service, 
            // but in a production Zero-Trust model, we would block here.
        }

        return await this.executeLocal(topic as string, data, userMeta, meta.callerID as string | null, meta.correlationId as string | null);
    }

    private async executeLocal(
        actionName: string, 
        params: unknown, 
        user: Record<string, unknown>, 
        callerID: string | null = null,
        correlationId: string | null = null
    ): Promise<unknown> {
        const action = this.localServices.get(actionName);
        if (!action) {
            throw new Error(`[ServiceBroker] Local handler not found for action: ${actionName}`);
        }

        const parentCtx = this.getContext();
        const ctx: Context<unknown> = {
            id: nanoid(),
            correlationId: correlationId || parentCtx?.correlationId || nanoid(),
            actionName,
            params,
            meta: { 
                ...parentCtx?.meta,
                user: { ...(parentCtx?.meta as Record<string, unknown>)?.user as Record<string, unknown>, ...user }
            } as Record<string, unknown>,
            callerID: callerID || parentCtx?.id || null,
            nodeID: this.app.nodeID,
            call: (a: string, p: unknown) => this.call(a as any, p as any),
            emit: (e: string, p: unknown) => this.emit(e as any, p as any)
        };

        // Wrap execution in middleware pipeline
        const executeWithMiddleware = async (index: number): Promise<any> => {
            if (index < this.middleware.length) {
                return await this.middleware[index](ctx, () => executeWithMiddleware(index + 1));
            }
            return await action.handler(ctx);
        };

        return await ContextStack.run(ctx, async () => {
            const result = await executeWithMiddleware(0);
            
            // Global Event Invalidation
            const stateChangingKeywords = ['create', 'update', 'delete', 'save', 'insert'];
            const [service, method] = actionName.split('.');
            if (stateChangingKeywords.some(k => method.toLowerCase().includes(k))) {
                this.emit(`$${service}.mutated` as any, { action: actionName, correlationId: ctx.correlationId } as any);
            }
            
            return result;
        });
    }

    private async executeRemote(nodeID: string, actionName: string, params: unknown, meta: Record<string, unknown>): Promise<unknown> {
        const parentCtx = this.getContext();
        meta.correlationId = (parentCtx?.correlationId || nanoid());
        meta.callerID = (parentCtx?.id || null) as any;

        try {
            const ticketManager = this.app.getProvider<any>('auth:ticket');
            const st = await ticketManager.getTicketFor(nodeID);
            meta.token = st;
        } catch (err) { }

        return this.network.send(nodeID, { 
            topic: actionName,
            data: params,
            id: meta.correlationId as string,
            type: 'REQUEST',
            senderNodeID: this.app.nodeID,
            timestamp: Date.now(),
            meta 
        } as MeshPacket);
    }
}
