import { MeshApp } from '../src/core/MeshApp';
import { RegistryModule } from '../src/modules/RegistryModule';
import { NetworkModule } from '../src/modules/NetworkModule';
import { ServiceBroker } from '../src/core/ServiceBroker';
import { MeshNetwork } from 'isomorphic-mesh';
import { ServiceRegistry } from 'isomorphic-registry';

describe('isomorphic-core Integration', () => {
    let app: MeshApp;

    beforeEach(() => {
        app = new MeshApp({ nodeID: 'test-node', namespace: 'test' });
    });

    afterEach(async () => {
        await app.stop();
    });

    test('should boot and register core components', async () => {
        app.use(new RegistryModule());
        app.use(new NetworkModule({ port: 0 }));

        await app.start();

        const registry = app.getProvider<ServiceRegistry>('registry');
        const network = app.getProvider<MeshNetwork>('network');

        expect(registry).toBeDefined();
        expect(network).toBeDefined();
        expect(network.nodeId).toBe('test-node');
    });

    test('should allow a ServiceBroker to route a call', async () => {
        app.use(new RegistryModule());
        app.use(new NetworkModule({ port: 0 }));

        await app.start();

        const registry = app.getProvider<ServiceRegistry>('registry');
        const network = app.getProvider<MeshNetwork>('network');
        const broker = new ServiceBroker(app, network, registry);

        // Register a mock remote node in the registry
        registry.registerNode({
            nodeID: 'remote-node',
            type: 'worker',
            namespace: 'test',
            addresses: ['ws://127.0.0.1:9999'],
            services: [
                { 
                    name: 'users', 
                    actions: { 
                        'login': { visibility: 'public' } 
                    } 
                }
            ],
            nodeSeq: 1,
            hostname: 'remote-host',
            timestamp: Date.now(),
            available: true,
            metadata: {},
            trustLevel: 'public',
            capabilities: {},
            pid: 0
        });

        // Mock network send
        const sendSpy = jest.spyOn(network, 'send').mockResolvedValue({ success: true } as any);

        const result = await broker.call('users.login', { username: 'bob' });

        expect(sendSpy).toHaveBeenCalledWith('remote-node', 'users.login', { username: 'bob' });
        expect(result).toEqual({ success: true });
    });
});
