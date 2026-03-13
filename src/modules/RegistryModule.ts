import { IMeshModule, IMeshApp } from '../interfaces/index';
import { ServiceRegistry } from 'isomorphic-registry';

export class RegistryModule implements IMeshModule {
    public readonly name = 'registry';
    private registry!: ServiceRegistry;

    constructor(private options: { bucketSize?: number } = {}) { }

    onInit(app: IMeshApp): void {
        const logger = (app as any).logger || { 
            debug: console.log, 
            info: console.log, 
            warn: console.warn, 
            error: console.error,
            child: () => logger
        };

        this.registry = new ServiceRegistry(app.nodeID, logger, {
            dht: { enabled: true, bucketSize: this.options.bucketSize }
        });

        app.registerProvider('registry', this.registry);
    }
}
