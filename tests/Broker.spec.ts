import { MeshApp } from '../src/core/MeshApp';
import { RegistryModule } from '../src/modules/RegistryModule';
import { NetworkModule } from '../src/modules/NetworkModule';
import { BrokerModule } from '../src/modules/BrokerModule';
import { MeshActionSchemaRegistry } from '../src/core/ServiceBroker';
import { z } from 'zod';

describe('ServiceBroker & Zod Contracts', () => {
    let app: MeshApp;

    beforeEach(() => {
        app = new MeshApp({ nodeID: 'test-node' });
        MeshActionSchemaRegistry.clear();
    });

    class TestService {
        async hello(ctx: any) {
            return `Hello, ${ctx.params.name}!`;
        }
    }

    test('should register a service and execute a local call with Zod validation', async () => {
        // 1. Setup modules
        app.use(new RegistryModule());
        app.use(new NetworkModule({ port: 0 }));
        app.use(new BrokerModule());

        // 2. Define Contract
        MeshActionSchemaRegistry.set('test.hello', {
            params: z.object({ name: z.string() }),
            returns: z.string()
        });

        // 3. Register Service
        app.registerService(new TestService());

        await app.start();

        const broker: any = app.getProvider('broker');

        // 4. Successful Call
        const result = await broker.call('test.hello', { name: 'Alice' });
        expect(result).toBe('Hello, Alice!');

        // 5. Validation Failure (Params)
        await expect(broker.call('test.hello', { name: 123 }))
            .rejects.toThrow();
    });
});
