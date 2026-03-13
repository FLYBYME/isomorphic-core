import { IServiceBroker } from '../interfaces/IServiceBroker';
import { IMeshApp } from '../interfaces/IMeshApp';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';
import { nanoid } from 'nanoid';
import { Context } from 'isomorphic-registry';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { z } from 'zod';
import { MeshTokenManager } from 'isomorphic-auth';
import { ILogger } from '../types/core.types';

// Use require to avoid issues with browser/isomorphic environments
let ALS: any;
try {
    ALS = require('node:async_hooks').AsyncLocalStorage;
} catch (e) {
    // If we're in the browser, ALS will be unavailable
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
    private localServices = new Map<string, (ctx: Context<any>) => Promise<any>>();
    private logger: ILogger;
    private storage = ALS ? new ALS() : null;

    constructor(
        private app: IMeshApp,
        private network: MeshNetwork,
        private registry: ServiceRegistry
    ) { 
        this.logger = app.getProvider<ILogger>('logger') || app.logger;
    }

    /**
     * Retrieves the active execution context for the current operation.
     */
    public getContext(): Context<any> | undefined {
        return this.storage?.getStore();
    }

    /**
     * Registers a service instance and maps its methods to actions.
     */
    public registerService(service: any): void {
        const serviceName = service.name || service.constructor.name.replace('Service', '').toLowerCase();
        
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
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

        // 2. Find the node that handles this action
        const targetNode = this.registry.selectNode(actionName, { action: actionName, params });
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

    /**
     * Interceptor for incoming mesh packets.
     * Validates tokens and maps claims before dispatching to dispatcher.
     */
    public async handleIncomingRPC(packet: any): Promise<any> {
        const { topic, data, meta = {} } = packet;
        
        // 1. Auth Middleware: Validate Service Ticket (ST) if present
        let userMeta: Record<string, any> = {};
        if (meta.token) {
            try {
                const tokenManager = this.app.getProvider<MeshTokenManager>('auth:token');
                const decoded = await tokenManager.verify(meta.token);
                if (decoded) {
                    userMeta = {
                        id: decoded.sub,
                        groups: decoded.capabilities || [],
                        type: decoded.type
                    };
                }
            } catch (err) {
                this.logger.warn('Token validation failed', { error: err });
            }
        }

        // 2. Local Execution
        return await this.executeLocal(topic, data, userMeta, meta.callerID);
    }

    private async executeLocal(actionName: string, params: any, user: Record<string, any>, callerID: string | null = null): Promise<any> {
        const handler = this.localServices.get(actionName);
        if (!handler) {
            throw new Error(`[ServiceBroker] Local handler not found for action: ${actionName}`);
        }

        const ctx: Context<any> = {
            id: nanoid(),
            actionName,
            params,
            meta: { user },
            callerID,
            nodeID: this.app.nodeID,
            call: (a: string, p: unknown) => this.call(a as any, p as any),
            emit: (e: string, p: unknown) => this.emit(e as any, p as any)
        };

        if (this.storage) {
            return await this.storage.run(ctx, () => handler(ctx));
        }

        return await handler(ctx);
    }

    private async executeRemote(nodeID: string, actionName: string, params: any, meta: Record<string, any>): Promise<any> {
        this.logger.debug(`Calling remote action: ${actionName} on node: ${nodeID}`);
        
        try {
            const ticketManager = this.app.getProvider<any>('auth:ticket');
            const st = await ticketManager.getTicketFor(nodeID);
            meta.token = st;
        } catch (err) { }

        return this.network.send(nodeID, actionName, { ...params, meta });
    }
}
