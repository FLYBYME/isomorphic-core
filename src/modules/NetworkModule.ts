import { IMeshModule, IMeshApp } from '../interfaces/index';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';

export class NetworkModule implements IMeshModule {
    public readonly name = 'network';
    private network!: MeshNetwork;

    constructor(private options: { port: number, transportType?: string } = { port: 4000 }) { }

    onInit(app: IMeshApp): void {
        const registry = app.getProvider<ServiceRegistry>('registry');
        const logger = (app as any).logger || { 
            debug: console.log, 
            info: console.log, 
            warn: console.warn, 
            error: console.error,
            child: () => logger
        };

        this.network = new MeshNetwork({
            nodeId: app.nodeID,
            port: this.options.port,
            transportType: (this.options.transportType as any) || 'ws',
            serializerType: 'json',
            host: '0.0.0.0'
        }, logger, registry);

        app.registerProvider('network', this.network);
    }

    async onReady(app: IMeshApp): Promise<void> {
        await this.network.start();
    }

    async onStop(app: IMeshApp): Promise<void> {
        await this.network.stop();
    }
}
