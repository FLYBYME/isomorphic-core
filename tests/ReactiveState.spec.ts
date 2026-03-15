import { ReactiveState } from '../src/core/ReactiveState';

describe('ReactiveState', () => {
    it('Reactive State Proxies: triggers listeners on shallow property updates', () => {
        const state = new ReactiveState({ count: 0 });
        const listener = jest.fn();
        state.subscribe(listener);

        state.data.count = 1;
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('Deep State Mutation: nested object mutations do not trigger listeners (intended behavior check)', () => {
        const state = new ReactiveState({ nested: { val: 0 } });
        const listener = jest.fn();
        state.subscribe(listener);

        state.data.nested.val = 1;
        
        // Verified as shallow-only, so it should be 0.
        expect(listener).toHaveBeenCalledTimes(0);
    });
});
