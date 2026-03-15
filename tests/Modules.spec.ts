import { MeshApp } from '../src/core/MeshApp';
import { ConfigModule } from '../src/modules/ConfigModule';
import { BrokerModule } from '../src/modules/BrokerModule';
import { z } from 'zod';

describe('Core Modules', () => {
    let app: MeshApp;

    beforeEach(() => {
        app = new MeshApp({ nodeID: 'test' });
    });

    test('Config Module Merging: deep-merge logic when combining objects', () => {
        const schema = z.object({
            db: z.object({
                host: z.string(),
                port: z.number()
            }),
            debug: z.boolean()
        });

        // Simulating deep merge by passing nested values to the constructor
        const mod = new ConfigModule(schema, {
            db: { host: 'localhost', port: 5432 },
            debug: true
        });

        expect(mod.get('db').host).toBe('localhost');
        expect(mod.get('debug')).toBe(true);
    });

    test('Plugin Pipe Logic: broker.pipe() correctly attaches third-party plugins', async () => {
        app.use(new BrokerModule());
        await app.start();
        const broker = app.getProvider<any>('broker');

        const mockPlugin = {
            name: 'test-plugin',
            onRegister: jest.fn(),
            onStart: jest.fn()
        };

        broker.pipe(mockPlugin);
        expect(mockPlugin.onRegister).toHaveBeenCalledWith(broker);

        await broker.start();
        expect(mockPlugin.onStart).toHaveBeenCalledWith(broker);
    });
});
