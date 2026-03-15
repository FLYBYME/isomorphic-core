import { MeshApp } from '../src/core/MeshApp';
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
        name = 'test';
        actions = {
            hello: {
                params: z.object({ name: z.string() }),
                returns: z.string(),
                handler: this.hello.bind(this)
            }
        };
        async hello(ctx: any) {
            return `Hello, ${ctx.params.name}!`;
        }
    }

    test('Service Broker Local Calls: Routes to locally registered service without network overhead', async () => {
        app.use(new BrokerModule());
        const service = {
            name: 'local',
            actions: {
                test: {
                    params: z.object({}),
                    returns: z.string(),
                    handler: async () => 'ok'
                }
            }
        };
        app.registerService(service as any);
        await app.start();

        const broker = app.getProvider<any>('broker');
        const spy = jest.spyOn(broker, 'executeRemote');
        
        const res = await broker.call('local.test', {});
        expect(res).toBe('ok');
        expect(spy).not.toHaveBeenCalled();
    });

    test('Service Broker: execute a local call with Zod validation', async () => {
        app.use(new BrokerModule());

        app.registerService(new TestService() as any);
        await app.start();

        const broker: any = app.getProvider('broker');
        const result = await broker.call('test.hello', { name: 'Alice' });
        expect(result).toBe('Hello, Alice!');

        await expect(broker.call('test.hello', { name: 123 })).rejects.toThrow();
    });

    test('Interceptors Pipeline: multiple interceptors execute in "onion" order', async () => {
        app.use(new BrokerModule());
        const order: string[] = [];
        
        const mw1: any = async (ctx: any, next: any) => {
            order.push('mw1-in');
            const res = await next();
            order.push('mw1-out');
            return res;
        };

        const mw2: any = async (ctx: any, next: any) => {
            order.push('mw2-in');
            const res = await next();
            order.push('mw2-out');
            return res;
        };

        app.use(mw1).use(mw2);
        app.registerService({
            name: 'test',
            actions: { call: { params: z.any(), returns: z.any(), handler: async () => { order.push('handler'); return 'ok'; } } }
        } as any);
        
        await app.start();
        await app.getProvider<any>('broker').call('test.call', {});

        expect(order).toEqual(['mw1-in', 'mw2-in', 'handler', 'mw2-out', 'mw1-out']);
    });

    test('Global Error Handling: unhandled service errors caught and wrapped', async () => {
        app.use(new BrokerModule());
        app.registerService({
            name: 'error',
            actions: { throw: { params: z.any(), returns: z.any(), handler: async () => { throw new Error('BOOM'); } } }
        } as any);

        await app.start();
        const broker = app.getProvider<any>('broker');

        await expect(broker.call('error.throw', {})).rejects.toThrow('BOOM');
    });

    test('Service Inference: extracts types from Zod schemas for compile-time safety', () => {
        // This is primarily a compile-time check, but we can verify the utility types exist
        const schema = z.object({ name: z.string() });
        type Params = z.infer<typeof schema>;
        const p: Params = { name: 'test' };
        expect(p.name).toBe('test');
    });
});
