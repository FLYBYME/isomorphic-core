import { IMeshModule, IMeshApp } from '../interfaces/index';
import { ServiceBroker } from '../core/ServiceBroker';
import { MeshNetwork } from 'isomorphic-mesh';
import { MeshPacket } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';

/**
 * BrokerModule — Wires the ServiceBroker into the MeshApp and connects it to the Network.
 */
export class BrokerModule implements IMeshModule {
    public readonly name = 'broker';

    onInit(app: IMeshApp): void {
        const network = app.getProvider<MeshNetwork>('network');
        const registry = app.getProvider<ServiceRegistry>('registry');

        const broker = new ServiceBroker(app, network, registry);
        app.registerProvider('broker', broker);

        // Wire the broker to handle incoming RPC requests from the network
        network.onMessage('$rpc.request', async (data: any, packet: MeshPacket) => {
            const rpcData = data as Record<string, unknown>;
            try {
                // The packet contains topic (action), data (params), and meta (token, etc.)
                const result = await broker.handleIncomingRPC({
                    topic: rpcData.action as string || packet.topic,
                    data: rpcData.params || rpcData,
                    meta: packet.meta || {}
                });

                // Send response back if it was a request
                if (packet.id) {
                    await network.send(packet.senderNodeID!, '$rpc.response', {
                        id: packet.id,
                        data: result as Record<string, unknown>,
                        type: 'RESPONSE'
                    });
                }
            } catch (err: unknown) {
                if (packet.id) {
                    const message = err instanceof Error ? err.message : String(err);
                    await network.send(packet.senderNodeID!, '$rpc.response', {
                        id: packet.id,
                        data: { message },
                        type: 'RESPONSE_ERROR'
                    });
                }
            }
        });
    }
}
