import { IMeshModule, IMeshApp, ILogger, IServiceBroker, IBrokerPlugin, IContext } from '../interfaces';
import { ServiceBroker } from '../core/ServiceBroker';

/**
 * BrokerModule — Wires the ServiceBroker into the MeshApp and supports plugin-based composition.
 * Adheres to strict type safety rules and manages the plugin/middleware lifecycle.
 */
export class BrokerModule implements IMeshModule {
    public readonly name = 'broker';
    public logger!: ILogger;
    public serviceBroker!: IServiceBroker;
    private broker!: ServiceBroker;

    private pendingPlugins: IBrokerPlugin[] = [];
    private pendingMiddleware: ((ctx: IContext<Record<string, unknown>, Record<string, unknown>>, next: () => Promise<unknown>) => Promise<unknown>)[] = [];

    onInit(app: IMeshApp): void {
        this.broker = new ServiceBroker(app);
        this.serviceBroker = this.broker;
        app.registerProvider('broker', this.broker);
    }

    /**
     * Pipes a plugin into the broker for declarative composition.
     */
    public pipe(plugin: IBrokerPlugin): this {
        if (!this.broker) {
            this.pendingPlugins.push(plugin);
        } else {
            this.broker.pipe(plugin);
        }
        return this;
    }

    /**
     * Registers a middleware directly.
     */
    public use(middleware: (ctx: IContext<Record<string, unknown>, Record<string, unknown>>, next: () => Promise<unknown>) => Promise<unknown>): this {
        if (!this.broker) {
            this.pendingMiddleware.push(middleware);
        } else {
            this.broker.use(middleware as any); // Cast middleware internally for broker integration
        }
        return this;
    }

    public async onStart(): Promise<void> {
        // Apply pending plugins
        for (const p of this.pendingPlugins) {
            this.broker.pipe(p);
        }
        this.pendingPlugins = [];

        // Apply pending middleware
        for (const m of this.pendingMiddleware) {
            this.broker.use(m);
        }
        this.pendingMiddleware = [];

        // Trigger broker startup (calls plugin onStart hooks if implemented)
        await this.broker.start();
    }

    public async onStop(): Promise<void> {
        if (this.broker) {
            await this.broker.stop();
        }
    }
}
