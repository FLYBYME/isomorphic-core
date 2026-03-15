import { IMeshApp, IMeshModule, AppConfig, IProviderToken, IContext, ILogger, IServiceBroker, IServiceInstance, IServiceSchema, IServiceRegistry } from '../interfaces';
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
    protected pendingMiddleware: ((ctx: IContext<Record<string, unknown>, Record<string, unknown>>, next: () => Promise<unknown>) => Promise<unknown>)[] = [];
    protected providers = new Map<string, unknown>();
    protected pendingServices: IServiceSchema[] = [];
    public orchestrator: BootOrchestrator;

    constructor(config: AppConfig) {
        this.nodeID = config.nodeID;
        this.namespace = config.namespace || 'default';
        this.config = config;
        this.orchestrator = new BootOrchestrator(this as IMeshApp);

        this.logger = (config['logger'] as ILogger) || {
            debug: (msg: string, data?: Record<string, unknown>) => console.debug(`[${this.nodeID}] ${msg}`, data || ''),
            info: (msg: string, data?: Record<string, unknown>) => console.info(`[${this.nodeID}] ${msg}`, data || ''),
            warn: (msg: string, data?: Record<string, unknown>) => console.warn(`[${this.nodeID}] ${msg}`, data || ''),
            error: (msg: string, data?: Record<string, unknown>) => console.error(`[${this.nodeID}] ${msg}`, data || ''),
            child: () => this.logger
        };

        this.registerProvider('logger' as IProviderToken<ILogger>, this.logger);
        this.registerProvider('app' as IProviderToken<IMeshApp>, this as IMeshApp);
    }

    public get registry(): IServiceRegistry {
        return this.getProvider<IServiceRegistry>('registry');
    }

    public getConfig(): AppConfig {
        return this.config;
    }

    public use(moduleOrMiddleware: IMeshModule | ((ctx: IContext<Record<string, unknown>, Record<string, unknown>>, next: () => Promise<unknown>) => Promise<unknown>)): this {
        if (typeof moduleOrMiddleware === 'function') {
            if (this.hasProvider('broker')) {
                const broker = this.getProvider<IServiceBroker>('broker');
                broker.use(moduleOrMiddleware as any); // Type narrowing middleware is complex, cast to any temporarily but interface is strict
            } else {
                this.pendingMiddleware.push(moduleOrMiddleware);
            }
        } else {
            this.modules.push(moduleOrMiddleware);
        }
        return this;
    }

    public registerService(service: IServiceSchema): this {
        if (this.hasProvider('broker')) {
            const broker = this.getProvider<IServiceBroker>('broker');
            broker.registerService(service);
        } else {
            this.pendingServices.push(service);
        }
        return this;
    }

    private getTokenKey<T>(token: IProviderToken<T>): string {
        if (typeof token === 'string' || typeof token === 'symbol') {
            return token.toString();
        }
        // Force explicit identifiers if available to prevent minification mangling.
        const t = token as unknown as { id?: string | symbol; name?: string };
        if (t.id) return String(t.id);
        if (t.name && t.name !== 'Function' && t.name !== 'Object') return t.name;
        
        throw new Error(`[MeshApp] Invalid provider token. Use a string, symbol, or a class/function with a stable name/id.`);
    }

    public hasProvider<T>(token: IProviderToken<T>): boolean {
        try {
            const key = this.getTokenKey(token);
            return this.providers.has(key);
        } catch {
            return false;
        }
    }

    public registerProvider<T>(token: IProviderToken<T>, provider: T): void {
        const key = this.getTokenKey(token);
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
        const key = this.getTokenKey(token);
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

    public async publish<T = unknown>(topic: string, data: T): Promise<void> {
        if (this.hasProvider('broker')) {
            const broker = this.getProvider<IServiceBroker>('broker');
            broker.emit(topic, data);
        } else {
            // Potentially queue or log
            this.logger.warn(`[MeshApp] Cannot publish to ${topic}, broker not initialized.`);
        }
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
