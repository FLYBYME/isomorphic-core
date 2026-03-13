import { IMeshModule, IMeshApp } from '../interfaces/index';
import { ReactiveState } from '../client/ReactiveState';

/**
 * StateModule — Initializes the JavaScript Proxy-based reactive state tree.
 */
export class StateModule implements IMeshModule {
    public readonly name = 'state';
    private state!: ReactiveState<object>;
    private unsubGlobal: (() => void) | null = null;

    constructor(private initialState: object = {}) {}

    onInit(app: IMeshApp): void {
        console.log('[StateModule] Initializing reactive state tree...');
        
        // Take initial state from config if not provided in constructor
        const initial = Object.keys(this.initialState).length > 0 
            ? this.initialState 
            : (app.config['initialState'] as object) || {};

        this.state = new ReactiveState(initial);

        // Register the state tree in the DI container
        app.registerProvider('state', this.state);
        app.registerProvider('state:data', this.state.data);
    }

    onBind(app: IMeshApp): void {
        // Emit mutation events locally via the broker if available
        // FIX: Memory Leak - Store unsubscription function
        this.unsubGlobal = this.state.subscribeGlobal(() => {
            try {
                const broker = app.getProvider<any>('broker');
                broker.emit('$state.mutated', this.state.data);
            } catch (err) {
                // Broker might not be registered yet or at all
            }
        });
    }

    onStop(): void {
        if (this.unsubGlobal) {
            this.unsubGlobal();
            this.unsubGlobal = null;
        }
    }
}
