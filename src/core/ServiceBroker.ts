import { IServiceBroker } from '../interfaces/IServiceBroker';
import { IMeshApp } from '../interfaces/IMeshApp';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';
import { nanoid } from 'nanoid';
import { Context } from '../contracts/Context';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { z } from 'zod';
import { MeshTokenManager } from 'isomorphic-auth';
import { ILogger } from '../types/core.types';
import { ContextStack } from './ContextStack';

/**
 * Runtime Action Registry for Zod validation.
 */
export const MeshActionSchemaRegistry: Map<string, { params: z.ZodTypeAny, returns: z.ZodTypeAny }> = new Map();

/**
 * ServiceBroker — The "OS Kernel" that routes requests locally or remotely.
 * Includes middleware for security and validation.
 */
export class ServiceBroker implements IServiceBroker {
    private localServices = new Map<string, (ctx: Context<any>) => Promise<any>>();
    private middleware: ((ctx: Context<any>, next: () => Promise<any>) => Promise<any>)[] = [];
    private logger: ILogger;

    constructor(
        private app: IMeshApp,
        private network: MeshNetwork,
        private registry: ServiceRegistry
    ) { 
        this.logger = app.getProvider<ILogger>('logger') || app.logger;
    }

    public use(mw: (ctx: Context<any>, next: () => Promise<any>) => Promise<any>): void {
        this.middleware.push(mw);
    }

    /**
     * Retrieves the active execution context for the current operation.
     */
    public getContext(): Context<any> | undefined {
        return ContextStack.getContext();
    }

    /**
     * Registers a service instance and maps its methods to actions.
     */
    public registerService(service: any): void {
        const serviceName = service.name || service.constructor.name.replace('Service', '').toLowerCase();
        
        const prototype = Object.getPrototypeOf(service);
        const methods = Object.getOwnPropertyNames(prototype);
        for (const method of methods) {
            if (method === 'constructor' || method.startsWith('_')) continue;
            
            const handler = service[method];
            if (typeof handler === 'function') {
                const actionName = `${serviceName}.${method}`;
                this.logger.debug(`Registering local action: ${actionName}`);
                this.localServices.set(actionName, handler.bind(service));
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
            return await this.executeLocal(actionName, params, {});
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
        let result: any;
        if (targetNode.nodeID === this.app.nodeID) {
            result = await this.executeLocal(actionName, params, {});
        } else {
            result = await this.executeRemote(targetNode.nodeID, actionName, params, {});
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

    public on(event: string, handler: (payload: any) => void): (() => void) {
        this.network.onMessage(event, handler);
        return () => this.off(event, handler);
    }

    public off(event: string, handler: (payload: any) => void): void {
        (this.network.dispatcher as any).off(event, handler);
    }

    public async handleIncomingRPC(packet: any): Promise<any> {
        const { topic, data, meta = {} } = packet;
        
        let userMeta: Record<string, any> = {};
        if (meta.token) {
            try {
                const tokenManager = this.app.getProvider<MeshTokenManager>('auth:token');
                const decoded = await tokenManager.verify(meta.token);
                if (decoded) {
                    userMeta = {
                        id: decoded.sub,
                        groups: decoded.capabilities || [],
                        type: decoded.type,
                        tenant_id: decoded.tenant_id
                    };
                }
            } catch (err) { }
        }

        return await this.executeLocal(topic, data, userMeta, meta.callerID, meta.correlationId);
    }

    private async executeLocal(
        actionName: string, 
        params: any, 
        user: Record<string, any>, 
        callerID: string | null = null,
        correlationId: string | null = null
    ): Promise<any> {
        const handler = this.localServices.get(actionName);
        if (!handler) {
            throw new Error(`[ServiceBroker] Local handler not found for action: ${actionName}`);
        }

        const parentCtx = this.getContext();
        const ctx: Context<any> = {
            id: nanoid(),
            correlationId: correlationId || parentCtx?.correlationId || nanoid(),
            actionName,
            params,
            meta: { 
                ...parentCtx?.meta,
                user: { ...(parentCtx?.meta as any)?.user, ...user }
            },
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
            return await handler(ctx);
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

    private async executeRemote(nodeID: string, actionName: string, params: any, meta: Record<string, any>): Promise<any> {
        const parentCtx = this.getContext();
        meta.correlationId = parentCtx?.correlationId || nanoid();
        meta.callerID = parentCtx?.id || null;

        try {
            const ticketManager = this.app.getProvider<any>('auth:ticket');
            const st = await ticketManager.getTicketFor(nodeID);
            meta.token = st;
        } catch (err) { }

        return this.network.send(nodeID, actionName, { ...params, meta });
    }
}
