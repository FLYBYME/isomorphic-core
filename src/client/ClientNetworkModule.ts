import { IMeshModule, IMeshApp } from '../interfaces/index';
import { BrowserWebSocketTransport } from 'isomorphic-mesh/browser';

/**
 * ClientNetworkModule — Wraps the browser-specific WebSocket transport.
 */
export class ClientNetworkModule implements IMeshModule {
    public readonly name = 'network';
    private transport: BrowserWebSocketTransport;

    constructor(private options: { url: string }) {
        this.transport = new BrowserWebSocketTransport(options.url);
    }

    onInit(app: IMeshApp): void {
        app.registerProvider('network', this.transport);
        app.registerProvider('transport', this.transport);
    }

    async onReady(app: IMeshApp): Promise<void> {
        await this.transport.connect();
    }

    async onStop(): Promise<void> {
        await this.transport.disconnect();
    }
}
