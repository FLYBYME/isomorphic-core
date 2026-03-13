import { IServiceBroker } from '../interfaces/IServiceBroker';
import { IMeshApp } from '../interfaces/IMeshApp';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';
import { nanoid } from 'nanoid';

/**
 * ServiceBroker — The "OS Kernel" that routes requests locally or remotely.
 */
export class ServiceBroker implements IServiceBroker {
    constructor(
        private app: IMeshApp,
        private network: MeshNetwork,
        private registry: ServiceRegistry
    ) { }

    public async call<TResult = any>(action: string, params: Record<string, any> = {}): Promise<TResult> {
        // 1. Find the node that handles this action
        const targetNode = this.registry.selectNode(action, { action, params });
        if (!targetNode) {
            throw new Error(`[ServiceBroker] No node found for action: ${action}`);
        }

        // 2. Local or Remote?
        if (targetNode.nodeID === this.app.nodeID) {
            return this.executeLocal(action, params);
        } else {
            return this.executeRemote(targetNode.nodeID, action, params);
        }
    }

    public emit(event: string, params: Record<string, any> = {}): void {
        this.network.publish(event, params);
    }

    private async executeLocal(action: string, params: Record<string, any>): Promise<any> {
        // For now, local execution is just a placeholder. 
        // In a full system, this would find the registered ServiceInstance and call its action handler.
        console.log(`[ServiceBroker] Executing local action: ${action}`);
        throw new Error(`[ServiceBroker] Local execution not yet implemented for: ${action}`);
    }

    private async executeRemote(nodeID: string, action: string, params: Record<string, any>): Promise<any> {
        const id = nanoid();
        console.log(`[ServiceBroker] Calling remote action: ${action} on node: ${nodeID}`);
        
        // This is a simplified request-response over fire-and-forget publish/subscribe
        // In isomorphic-mesh, we might need a real 'call' method that handles timeouts and correlation IDs.
        // For now, we'll use the 'send' method from MeshNetwork.
        return this.network.send(nodeID, action, params);
    }
}
