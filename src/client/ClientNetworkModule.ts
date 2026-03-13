import { IMeshModule, IMeshApp } from '../interfaces/index';
import { BrowserWebSocketTransport } from 'isomorphic-mesh';
import { EventEmitter } from 'eventemitter3';

/**
 * ClientNetworkModule — Adapts BrowserWebSocketTransport for the ServiceBroker.
 * Provides a compatible interface for BrokerModule without Node.js dependencies.
 */
export class ClientNetworkModule implements IMeshModule {
    public readonly name = 'network';
    private transport: BrowserWebSocketTransport;

    constructor(private options: { url: string }) {
        this.transport = new BrowserWebSocketTransport(options.url);
    }

    onInit(app: IMeshApp): void {
        // Lightweight Bridge that looks like MeshNetwork for the Broker
        const bridge = new EventEmitter();
        
        (bridge as any).send = async (nodeID: string, topic: string, data: any) => {
            await this.transport.send({
                id: crypto.randomUUID(),
                type: 'call',
                action: topic,
                payload: data,
                meta: {}
            });
        };

        (bridge as any).onMessage = (topic: string, handler: any) => {
            bridge.on(topic, handler);
        };

        (bridge as any).publish = async (topic: string, data: any) => {
             await this.transport.send({
                id: crypto.randomUUID(),
                type: 'emit',
                action: topic,
                payload: data,
                meta: {}
            });
        };

        this.transport.onMessage((packet) => {
            // Map MeshPacket back to the topic-based events BrokerModule expects
            bridge.emit(packet.action || packet.type, packet.payload, packet);
        });

        app.registerProvider('network', bridge);
        app.registerProvider('transport', this.transport);
    }

    async onReady(): Promise<void> {
        await this.transport.connect();
    }

    async onStop(): Promise<void> {
        await this.transport.disconnect();
    }
}
