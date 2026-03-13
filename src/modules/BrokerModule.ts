import { IMeshModule, IMeshApp } from '../interfaces/index';
import { ServiceBroker } from '../core/ServiceBroker';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';

export class BrokerModule implements IMeshModule {
    public readonly name = 'broker';

    onInit(app: IMeshApp): void {
        const network = app.getProvider<MeshNetwork>('network');
        const registry = app.getProvider<ServiceRegistry>('registry');

        const broker = new ServiceBroker(app, network, registry);
        app.registerProvider('broker', broker);
    }
}
