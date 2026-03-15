import { 
    IServiceBroker, 
    IMeshApp, 
    ILogger, 
    IMeshNetwork, 
    IServiceRegistry, 
    IContext, 
    IMeshPacket,
    IServiceActionRegistry,
    IServiceEventRegistry,
    IBrokerPlugin,
    IServiceSchema,
    IMiddleware
} from '../interfaces';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { ContextStack } from './ContextStack';

/**
 * Internal interfaces for safe structural typing without 'any'.
 */
interface HasOptionalOnInit { onInit?(app: IMeshApp): void; }
interface HasOptionalOff { off?(topic: string, handler: (payload: unknown) => void): void; }

/**
 * Metadata for local actions.
 */
interface LocalAction {
    handler: (ctx: IContext<unknown, Record<string, unknown>>) => Promise<unknown>;
    highSecurity?: boolean;
}

/**
 * Runtime Action Registry for Zod validation.
 */
export const MeshActionSchemaRegistry: Map<string, { params: z.ZodTypeAny, returns: z.ZodTypeAny, mutates?: boolean }> = new Map();

/**
 * ServiceBroker — The "OS Kernel" that routes requests locally or remotely.
 * Production-Grade implementation with Bipartite Pipeline.
 */
export class ServiceBroker implements IServiceBroker {
    private localServices = new Map<string, LocalAction>();
    
    // Bipartite Pipeline
    private globalMiddleware: IMiddleware[] = [];
    private localMiddleware: IMiddleware[] = [];
    
    private plugins: IBrokerPlugin[] = [];
    
    public logger: ILogger;
    public registry!: IServiceRegistry;
    public network!: IMeshNetwork;
    public resiliency = {} as Record<string, unknown>;

    // RPC Correlation
    private pendingRequests = new Map<string, { 
        resolve: (val: unknown) => void, 
        reject: (err: Error) => void, 
        timeout: NodeJS.Timeout 
    }>();

    constructor(public readonly app: IMeshApp) {
        this.logger = app.getProvider<ILogger>('logger') || app.logger;
    }

    public pipe(plugin: IBrokerPlugin): this {
        this.plugins.push(plugin);
        plugin.onRegister(this);
        return this;
    }

    public setNetwork(network: IMeshNetwork): void {
        this.network = network;
        this.setupNetworkListeners();
    }

    public setRegistry(registry: IServiceRegistry): void {
        this.registry = registry;
    }

    private setupNetworkListeners() {
        if (!this.network) return;
        this.network.onMessage('*', async (_data: unknown, packet: IMeshPacket) => {
            if (packet.type === 'RESPONSE' || packet.type === 'RESPONSE_ERROR') {
                const correlationId = (packet.meta?.correlationID || packet.id) as string;
                const pending = this.pendingRequests.get(correlationId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingRequests.delete(correlationId);
                    try {
                        if (packet.type === 'RESPONSE_ERROR') {
                            const errorData = packet.error;
                            pending.reject(new Error(errorData?.message || 'Remote RPC Error'));
                        } else {
                            pending.resolve(packet.data);
                        }
                    } catch (err) {
                        this.logger.error(`[ServiceBroker] Unhandled exception in RPC response handler for ${correlationId}:`, err);
                    }
                }
            }
        });
    }

    public use(mw: IMiddleware): void {
        this.globalMiddleware.push(mw);
    }

    public useLocal(mw: IMiddleware): void {
        this.localMiddleware.push(mw);
    }

    public getContext(): IContext<unknown, Record<string, unknown>> | undefined {
        return ContextStack.getContext() as IContext<unknown, Record<string, unknown>> | undefined;
    }

    public on(topic: string, handler: (payload: unknown) => void): (() => void) {
        if (!this.network) throw new Error('[ServiceBroker] Network not initialized');
        this.network.onMessage(topic, handler);
        return () => this.off(topic, handler);
    }

    public off(topic: string, handler: (payload: unknown) => void): void {
        const net = this.network as unknown as HasOptionalOff;
        if (typeof net.off === 'function') net.off(topic, handler);
    }

    public registerService(service: IServiceSchema): void {
        const serviceName = service.name || (service.constructor.name !== 'Object' ? service.constructor.name.replace('Service', '').toLowerCase() : undefined);
        if (!serviceName) throw new Error('[ServiceBroker] Service name must be provided');
        
        const serviceWithInit = service as unknown as HasOptionalOnInit;
        if (typeof serviceWithInit.onInit === 'function') serviceWithInit.onInit(this.app);

        const schemaActions = (service.actions || {}) as Record<string, IActionDefinition<unknown, unknown>>;
        const serviceDict = service as unknown as Record<string, unknown>;

        for (const actionNameKey of Object.keys(schemaActions)) {
            const handler = serviceDict[actionNameKey];
            const actionDef = schemaActions[actionNameKey];
            if (typeof handler === 'function') {
                const actionName = `${serviceName}.${actionNameKey}`;
                
                // Populate schema registry for runtime validation and mutation tracking
                MeshActionSchemaRegistry.set(actionName, {
                    params: actionDef.params,
                    returns: actionDef.returns,
                    mutates: actionDef.mutates
                });

                this.localServices.set(actionName, {
                    handler: handler.bind(service) as (ctx: IContext<unknown, Record<string, unknown>>) => Promise<unknown>,
                    highSecurity: (actionDef as any).highSecurity === true
                });
            } else {
                this.logger.warn(`[ServiceBroker] Action '${actionNameKey}' defined in schema for service '${serviceName}' but no handler found.`);
            }
        }
    }

    public async call<K extends keyof IServiceActionRegistry>(action: K, params: unknown): Promise<unknown> {
        return this.internalCall(action as string, params);
    }

    public emit<K extends keyof IServiceEventRegistry>(event: K, payload: unknown): void {
        if (!this.network) return;
        this.network.send('*', event as string, payload);
    }

    private async internalCall(actionName: string, params: unknown): Promise<unknown> {
        const schema = MeshActionSchemaRegistry.get(actionName);
        if (schema) params = schema.params.parse(params);
        
        const parentCtx = this.getContext();
        const traceId = parentCtx?.traceId || nanoid();
        const parentId = parentCtx?.spanId;
        const spanId = nanoid();

        const ctx: IContext<any, Record<string, any>> = {
            id: nanoid(),
            correlationID: parentCtx?.correlationID || nanoid(),
            actionName, 
            params,
            meta: { ...parentCtx?.meta },
            callerID: parentCtx?.id || null,
            nodeID: this.app.nodeID,
            traceId,
            spanId,
            parentId,
            call: (a: string, p: unknown) => this.internalCall(a, p),
            emit: (e: string, p: unknown) => this.emit(e as keyof IServiceEventRegistry, p)
        };

        const result = await this.handlePipeline(ctx);
        if (schema?.returns) {
            return schema.returns.parse(result);
        }
        return result;
    }

    public async handleIncomingRPC(packet: IMeshPacket): Promise<unknown> {
        const meta = (packet.meta as Record<string, any>) || {};
        
        const ctx: IContext<any, Record<string, any>> = {
            id: packet.id,
            correlationID: (packet.meta?.correlationID as string) || packet.id,
            actionName: packet.topic, 
            params: packet.data,
            meta,
            callerID: packet.senderNodeID,
            nodeID: this.app.nodeID,
            traceId: meta.traceId || nanoid(),
            spanId: meta.spanId || nanoid(),
            parentId: meta.parentId,
            call: (a: string, p: unknown) => this.internalCall(a, p),
            emit: (e: string, p: unknown) => this.emit(e as keyof IServiceEventRegistry, p)
        };

        const result = await this.handlePipeline(ctx);
        const schema = MeshActionSchemaRegistry.get(packet.topic);
        if (schema?.returns) {
            return schema.returns.parse(result);
        }
        return result;
    }

    /**
     * Bipartite Pipeline Execution Engine.
     */
    public async handlePipeline(ctx: IContext<any, Record<string, any>>): Promise<unknown> {
        return await ContextStack.run(ctx as any, async () => {
            try {
                await this.executeChain(ctx, this.globalMiddleware);
                if (ctx.result !== undefined) return ctx.result;

                if (!ctx.targetNodeID || ctx.targetNodeID === this.app.nodeID) {
                    await this.executeChain(ctx, this.localMiddleware);
                    if (ctx.result !== undefined) return ctx.result;

                    const action = this.localServices.get(ctx.actionName);
                    if (!action) throw new Error(`[ServiceBroker] Local action not found: ${ctx.actionName}`);
                    
                    return await action.handler(ctx);
                }

                throw new Error(`[ServiceBroker] Remote call to ${ctx.targetNodeID} unhandled by Global Pipeline.`);

            } catch (err) {
                (ctx as any).error = err;
                throw err;
            }
        });
    }

    private async executeChain(ctx: IContext<any, Record<string, any>>, chain: IMiddleware[]): Promise<void> {
        const executeNext = async (index: number): Promise<unknown> => {
            if (index < chain.length) return await chain[index](ctx, () => executeNext(index + 1));
            return undefined;
        };
        await executeNext(0);
    }

    public async executeRemote(nodeID: string, actionName: string, params: unknown, meta: Record<string, unknown> = {}): Promise<unknown> {
        if (!this.network) throw new Error('[ServiceBroker] Network not initialized');
        const requestId = nanoid();
        
        const currentCtx = this.getContext();
        const tracingMeta = {
            traceId: currentCtx?.traceId,
            spanId: currentCtx?.spanId,
            parentId: currentCtx?.parentId
        };

        const timeoutMs = (meta.timeout as number) || (this.app.config.rpcTimeout as number) || 10000;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`[ServiceBroker] RPC Timeout calling ${actionName} on ${nodeID} after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            this.network.send(nodeID, actionName, params, { 
                id: requestId, 
                type: 'REQUEST', 
                meta: { ...meta, ...tracingMeta, correlationID: requestId }, 
                senderNodeID: this.app.nodeID, 
                topic: actionName
            }).catch(err => {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(err instanceof Error ? err : new Error(String(err)));
            });
        });
    }

    public async start(): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.onStart) await plugin.onStart(this);
        }
    }

    public async stop(): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.onStop) await plugin.onStop(this);
        }
    }

    public createService(): void { throw new Error('Not implemented'); }
    public getSetting(): void { throw new Error('Not implemented'); }
    public setSetting(): void { throw new Error('Not implemented'); }
}
