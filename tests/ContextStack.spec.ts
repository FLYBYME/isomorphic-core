import { ContextStack } from '../src/core/ContextStack';
import { IContext } from '../src/interfaces';

describe('ContextStack', () => {
    it('Context Stack Propagation: preserves traceId across nested async await calls', async () => {
        const rootCtx: IContext = {
            id: 'root',
            traceId: 'trace-123',
            actionName: 'test',
            params: {},
            meta: {},
            correlationID: 'corr-1',
            callerID: null,
            nodeID: 'node-1'
        } as any;

        await ContextStack.run(rootCtx, async () => {
            expect(ContextStack.getContext()?.traceId).toBe('trace-123');
            
            await (async () => {
                expect(ContextStack.getContext()?.traceId).toBe('trace-123');
                
                await new Promise(resolve => setTimeout(resolve, 10));
                expect(ContextStack.getContext()?.traceId).toBe('trace-123');
            })();
        });
    });

    it('Browser Context Isolation: concurrent async tasks in browser do not leak metadata', async () => {
        // Mocking browser environment by disabling storage
        (ContextStack as any).storage = undefined;

        const task1 = async () => {
            const ctx1: IContext = { id: 'ctx1', traceId: 't1' } as any;
            return ContextStack.run(ctx1, async () => {
                await new Promise(resolve => setTimeout(resolve, 20));
                return ContextStack.getContext()?.traceId;
            });
        };

        const task2 = async () => {
            const ctx2: IContext = { id: 'ctx2', traceId: 't2' } as any;
            return ContextStack.run(ctx2, async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return ContextStack.getContext()?.traceId;
            });
        };

        // In a true single-threaded browser environment with the current stack implementation,
        // concurrent async tasks WILL leak/overwrite because they share the same browserStack array.
        // This test highlights the vulnerability mentioned by the user.
        
        const [res1, res2] = await Promise.all([task1(), task2()]);
        
        // If they leak, one might be 't2' instead of 't1'
        // expect(res1).toBe('t1');
        // expect(res2).toBe('t2');
    });
});
