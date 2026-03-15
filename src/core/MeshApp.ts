import { IMeshApp, IMeshModule, AppConfig, IProviderToken, IContext, ILogger, IServiceBroker, IServiceInstance, IServiceSchema } from '../interfaces';
import { BootOrchestrator } from './BootOrchestrator';

/**
 * MeshApp — The "Motherboard" shell that provides DI and lifecycle management.
 */
export class MeshApp implements IMeshApp {
    public readonly nodeID: string;
    public readonly namespace: string;
    public readonly config: AppConfig;
    public readonly logger: ILogger;

    protected modules: IMeshModule[] = [];
    protected pendingMiddleware: ((ctx: IContext<unknown, Record<string, unknown>>, next: () => Promise<unknown>) => Promise<unknown>)[] = [];
    protected providers = new Map<string, unknown>();
    protected pendingServices: IServiceSchema[] = [];
    private orchestrator: BootOrchestrator;

    constructor(config: AppConfig) {
        this.nodeID = config.nodeID;
        this.namespace = config.namespace || 'default';
        this.config = config;
        this.orchestrator = new BootOrchestrator(this);

        this.logger = (config['logger'] as ILogger) || {
            debug: (msg: string, data?: unknown) => console.debug(`[${this.nodeID}] ${msg}`, data || ''),
            info: (msg: string, data?: unknown) => console.info(`[${this.nodeID}] ${msg}`, data || ''),
            warn: (msg: string, data?: unknown) => console.warn(`[${this.nodeID}] ${msg}`, data || ''),
            error: (msg: string, data?: unknown) => console.error(`[${this.nodeID}] ${msg}`, data || ''),
            child: () => this.logger
        };

        this.registerProvider('logger' as IProviderToken<ILogger>, this.logger);
        this.registerProvider('app' as IProviderToken<IMeshApp>, this);
    }

    public use(moduleOrMiddleware: IMeshModule | ((ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>)): this {
        if (typeof moduleOrMiddleware === 'function') {
            try {
                const broker = this.getProvider<IServiceBroker>('broker');
                broker.use(moduleOrMiddleware);
            } catch (err) {
                this.pendingMiddleware.push(moduleOrMiddleware);
            }
        } else {
            this.modules.push(moduleOrMiddleware);
        }
        return this;
    }

    public registerService(service: IServiceSchema): this {
        try {
            const broker = this.getProvider<IServiceBroker>('broker');
            broker.registerService(service);
        } catch (err) {
            this.pendingServices.push(service);
        }
        return this;
    }

    public registerProvider<T>(token: IProviderToken<T>, provider: T): void {
        const key = typeof token === 'string' || typeof token === 'symbol'
            ? token.toString()
            : (token as unknown as { name: string }).name;
        this.providers.set(key, provider);

        if (key === 'broker') {
            const broker = provider as IServiceBroker;
            while (this.pendingMiddleware.length > 0) {
                broker.use(this.pendingMiddleware.shift()!);
            }
            while (this.pendingServices.length > 0) {
                const service = this.pendingServices.shift();
                if (service) broker.registerService(service);
            }
        }
    }

    public getProvider<T>(token: IProviderToken<T>): T {
        const key = typeof token === 'string' || typeof token === 'symbol'
            ? token.toString()
            : (token as unknown as { name: string }).name;
        const provider = this.providers.get(key);
        if (provider === undefined) {
            throw new Error(`[MeshApp] Provider not found for token: ${key}`);
        }
        return provider as T;
    }

    public async start(): Promise<void> {
        this.logger.info('MeshApp starting...');
        await this.orchestrator.executeBootSequence(this.modules);
        this.logger.info('MeshApp started successfully.');
    }

    public async call(action: string, params: unknown): Promise<unknown> {
        const broker = this.getProvider<IServiceBroker>('broker');
        return broker.call(action, params);
    }

    public emit(event: string, payload: unknown): void {
        const broker = this.getProvider<IServiceBroker>('broker');
        broker.emit(event, payload);
    }

    public async stop(): Promise<void> {
        this.logger.info('MeshApp stopping...');
        await this.orchestrator.executeTeardown(this.modules);
        this.logger.info('MeshApp stopped.');
    }
}

/**
 * Factory for creating a MeshApp instance.
 */
export function createMeshApp(config: AppConfig & { modules?: IMeshModule[] }): MeshApp {
    const app = new MeshApp(config);
    if (config.modules) {
        for (const mod of config.modules) {
            app.use(mod);
        }
    }
    return app;
}
