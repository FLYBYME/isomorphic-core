import { IServiceBroker } from '../interfaces/IServiceBroker';
import { IMeshApp } from '../interfaces/IMeshApp';
import { MeshNetwork, MeshPacket } from 'isomorphic-mesh';
import { ServiceRegistry, Context, MeshActionRegistry, MeshEventRegistry } from 'isomorphic-registry';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { Gatekeeper } from 'isomorphic-auth';
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
 */
export class ServiceBroker implements IServiceBroker {
    private localServices = new Map<string, LocalAction>();
    private middleware: ((ctx: Context<unknown>, next: () => Promise<unknown>) => Promise<unknown>)[] = [];
    private logger: ILogger;
    public pendingCalls = 0;

    // RPC Correlation
    private pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void, timeout: NodeJS.Timeout }>();

    constructor(
        private app: IMeshApp,
        private network: MeshNetwork,
        private registry: ServiceRegistry
    ) {
        this.logger = app.getProvider<ILogger>('logger') || app.logger;
        this.setupNetworkListeners();
    }

    private setupNetworkListeners() {
        this.network.onMessage('*', async (data: any, packet: MeshPacket) => {
            // 1. Handle incoming RPC requests
            if (packet.type === 'REQUEST') {
                if (packet.senderNodeID === this.app.nodeID) return;

                try {
                    const result = await this.handleIncomingRPC(packet);
                    await this.network.send(packet.senderNodeID, {
                        topic: packet.topic,
                        id: nanoid(),
                        type: 'RESPONSE',
                        data: result,
                        senderNodeID: this.app.nodeID,
                        timestamp: Date.now(),
                        meta: { correlationId: packet.id }
                    } as MeshPacket);
                } catch (err: any) {
                    await this.network.send(packet.senderNodeID, {
                        topic: packet.topic,
                        id: nanoid(),
                        type: 'RESPONSE_ERROR',
                        error: { message: err.message, code: err.code || 'RPC_ERROR' },
                        senderNodeID: this.app.nodeID,
                        timestamp: Date.now(),
                        meta: { correlationId: packet.id }
                    } as MeshPacket);
                }
            }
            // 2. Handle incoming RPC responses
            else if (packet.type === 'RESPONSE' || packet.type === 'RESPONSE_ERROR') {
                const correlationId = (packet.meta?.correlationId || packet.id) as string;
                const pending = this.pendingRequests.get(correlationId);
                
                console.debug(`[ServiceBroker] Correlation check: type=${packet.type}, corrId=${correlationId}, found=${!!pending}, pendingCount=${this.pendingRequests.size}`);
                if (!pending) {
                    console.debug(`[ServiceBroker] Keys in map: ${Array.from(this.pendingRequests.keys()).join(', ')}`);
                }

                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingRequests.delete(correlationId);

                    if (packet.type === 'RESPONSE_ERROR') {
                        const errorData = (packet as any).error;
                        pending.reject(new Error(errorData?.message || 'Remote RPC Error'));
                    } else {
                        pending.resolve(packet.data);
                    }
                }
            }
        });
    }

    public use(mw: (ctx: Context<unknown>, next: () => Promise<unknown>) => Promise<unknown>): void {
        this.middleware.push(mw);
    }

    public getContext(): Context<unknown> | undefined {
        return ContextStack.getContext() as Context<unknown> | undefined;
    }

    public on(event: string, handler: (payload: unknown) => void): (() => void) {
        this.network.onMessage(event, handler);
        return () => this.off(event, handler);
    }

    public off(event: string, handler: (payload: unknown) => void): void {
        (this.network.dispatcher as any).off(event, handler);
    }

    public registerService(service: any): void {
        const serviceName = service.name || service.constructor.name.replace('Service', '').toLowerCase();

        if (typeof service.onInit === 'function') {
            service.onInit(this.app);
        }

        const prototype = Object.getPrototypeOf(service);
        const methods = [...Object.getOwnPropertyNames(prototype), ...Object.getOwnPropertyNames(service)];

        const schemaActions = service.schema?.actions || service.actions || {};

        for (const method of methods) {
            if (method === 'constructor' || method.startsWith('_') || ['db', 'name', 'logger', 'onInit', 'started', 'actions'].includes(method)) continue;

            const handler = service[method];
            if (typeof handler === 'function') {
                const actionName = `${serviceName}.${method}`;
                const metadata = schemaActions[method] || {};
                this.localServices.set(actionName, {
                    handler: handler.bind(service),
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
        const schema = MeshActionSchemaRegistry.get(actionName);
        if (schema) {
            params = schema.params.parse(params);
        }

        let targetNode = this.registry.selectNode(actionName, { action: actionName, params });

        if (!targetNode && this.localServices.has(actionName)) {
            return await this.executeLocal(actionName, params, {}) as TReturn;
        }

        if (!targetNode) {
            for (let i = 0; i < 4; i++) {
                await new Promise(r => setTimeout(r, 200));
                targetNode = this.registry.selectNode(actionName, { action: actionName, params });
                if (targetNode) break;
            }
        }
        console.log(this.localServices, this.registry)
        if (!targetNode) throw new Error(`[ServiceBroker] No node found for action: ${actionName}`);

        let result: unknown;
        if (targetNode.nodeID === this.app.nodeID) {
            result = await this.executeLocal(actionName, params, {});
        } else {
            result = await this.executeRemote(targetNode.nodeID, actionName, params, {});
        }

        if (schema) result = schema.returns.parse(result);
        return result as TReturn;
    }

    public emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void {
        this.network.publish(event as string, payload as Record<string, unknown>);
    }

    public async handleIncomingRPC(packet: any): Promise<unknown> {
        const { topic, data, meta = {} } = packet;
        let userMeta: Record<string, unknown> = {};

        if (meta.token) {
            const gatekeeper = this.app.getProvider<Gatekeeper>('auth:gatekeeper');
            const decoded = await gatekeeper.verifyServiceTicket(meta.token);
            if (decoded) {
                userMeta = { id: decoded.sub, groups: decoded.capabilities || [], type: decoded.type, tenant_id: decoded.tenant_id };
            }
        }

        return await this.executeLocal(topic, data, userMeta, meta.callerID, packet.id);
    }

    private async executeLocal(actionName: string, params: unknown, user: any, callerID: string | null = null, correlationId: string | null = null): Promise<unknown> {
        const action = this.localServices.get(actionName);
        if (!action) throw new Error(`[ServiceBroker] Local handler not found for action: ${actionName}`);

        const parentCtx = this.getContext();
        const ctx: Context<unknown> = {
            id: nanoid(),
            correlationId: correlationId || parentCtx?.correlationId || nanoid(),
            actionName, params,
            meta: { ...parentCtx?.meta, user: { ...((parentCtx?.meta as any)?.user || {}), ...user } } as any,
            callerID: callerID || parentCtx?.id || null,
            nodeID: this.app.nodeID,
            call: (a: string, p: unknown) => this.call(a as any, p as any),
            emit: (e: string, p: unknown) => this.emit(e as any, p as any)
        };

        const executeWithMiddleware = async (index: number): Promise<any> => {
            if (index < this.middleware.length) return await this.middleware[index](ctx, () => executeWithMiddleware(index + 1));
            return await action.handler(ctx);
        };

        return await ContextStack.run(ctx, async () => {
            const result = await executeWithMiddleware(0);
            if (['create', 'update', 'delete', 'save', 'insert'].some(k => actionName.toLowerCase().includes(k))) {
                this.emit(`$${actionName.split('.')[0]}.mutated` as any, { action: actionName, correlationId: ctx.correlationId } as any);
            }
            return result;
        });
    }

    private async executeRemote(nodeID: string, actionName: string, params: unknown, meta: any): Promise<unknown> {
        const parentCtx = this.getContext();
        const requestId = nanoid();
        meta.correlationId = requestId;
        meta.callerID = parentCtx?.id || null;

        try {
            const ticketManager = this.app.getProvider<any>('auth:ticket');
            meta.token = await ticketManager.getTicketFor(nodeID);
        } catch (err) { }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`[ServiceBroker] RPC Timeout calling ${actionName} on ${nodeID}`));
            }, 10000);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            this.network.send(nodeID, {
                topic: actionName, data: params, id: requestId, type: 'REQUEST',
                senderNodeID: this.app.nodeID, timestamp: Date.now(), meta
            } as MeshPacket).catch(err => {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(err);
            });
        });
    }
}
