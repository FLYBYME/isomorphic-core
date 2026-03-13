import { IMeshModule, IMeshApp } from '../interfaces/index';
import { ServiceBroker } from '../core/ServiceBroker';
import { MeshNetwork } from 'isomorphic-mesh';
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
        network.onMessage('$rpc.request', async (data, packet) => {
            try {
                // The packet contains topic (action), data (params), and meta (token, etc.)
                const result = await broker.handleIncomingRPC({
                    topic: data.action || packet.topic,
                    data: data.params || data,
                    meta: packet.meta || {}
                });

                // Send response back if it was a request
                if (packet.id) {
                    await network.send(packet.senderNodeID!, '$rpc.response', {
                        id: packet.id,
                        data: result,
                        type: 'RESPONSE'
                    });
                }
            } catch (err: any) {
                if (packet.id) {
                    await network.send(packet.senderNodeID!, '$rpc.response', {
                        id: packet.id,
                        data: { message: err.message },
                        type: 'RESPONSE_ERROR'
                    });
                }
            }
        });
    }
}
