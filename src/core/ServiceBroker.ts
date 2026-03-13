import { IServiceBroker } from '../interfaces/IServiceBroker';
import { IMeshApp } from '../interfaces/IMeshApp';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';
import { nanoid } from 'nanoid';
import { Context } from '../contracts/Context';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { z } from 'zod';

/**
 * Runtime Action Registry for Zod validation.
 */
export const MeshActionSchemaRegistry: Map<string, { params: z.ZodTypeAny, returns: z.ZodTypeAny }> = new Map();

/**
 * ServiceBroker — The "OS Kernel" that routes requests locally or remotely.
 */
export class ServiceBroker implements IServiceBroker {
    private localServices = new Map<string, (ctx: Context<any>) => Promise<any>>();

    constructor(
        private app: IMeshApp,
        private network: MeshNetwork,
        private registry: ServiceRegistry
    ) { }

    /**
     * Registers a service instance and maps its methods to actions.
     * Assumes methods that don't start with '_' are actions.
     * Service name is taken from service.name or the class name.
     */
    public registerService(service: any): void {
        const serviceName = service.name || service.constructor.name.replace('Service', '').toLowerCase();
        
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
        for (const method of methods) {
            if (method === 'constructor' || method.startsWith('_')) continue;
            
            const handler = service[method];
            if (typeof handler === 'function') {
                const actionName = `${serviceName}.${method}`;
                console.log(`[ServiceBroker] Registering local action: ${actionName}`);
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
                console.error(`[ServiceBroker] Validation failed for action: ${actionName}`, err.errors);
                throw err;
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
            result = await this.executeLocal(actionName, params);
        } else {
            result = await this.executeRemote(targetNode.nodeID, actionName, params);
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

    private async executeLocal(actionName: string, params: any): Promise<any> {
        const handler = this.localServices.get(actionName);
        if (!handler) {
            throw new Error(`[ServiceBroker] Local handler not found for action: ${actionName}`);
        }

        // Create Context
        const ctx: Context<any> = {
            id: nanoid(),
            actionName,
            params,
            meta: {},
            callerID: null,
            nodeID: this.app.nodeID,
            call: (a: string, p: unknown) => this.call(a as any, p as any),
            emit: (e: string, p: unknown) => this.emit(e as any, p as any)
        };

        return await handler(ctx);
    }

    private async executeRemote(nodeID: string, actionName: string, params: any): Promise<any> {
        console.log(`[ServiceBroker] Calling remote action: ${actionName} on node: ${nodeID}`);
        // Simplified remote call via MeshNetwork
        return this.network.send(nodeID, actionName, params);
    }
}
