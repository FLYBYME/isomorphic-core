import { IMeshApp, IMeshModule, AppConfig, ProviderToken } from '../interfaces/index';
import { BootOrchestrator } from './BootOrchestrator';
import { IServiceBroker } from '../interfaces/IServiceBroker';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { ILogger } from '../types/core.types';

/**
 * MeshApp — The "Motherboard" shell that provides DI and lifecycle management.
 */
export class MeshApp implements IMeshApp {
    public readonly nodeID: string;
    public readonly namespace: string;
    public readonly config: AppConfig;
    public readonly logger: ILogger;

    protected modules: IMeshModule[] = [];
    protected pendingMiddleware: ((ctx: any, next: () => Promise<any>) => Promise<any>)[] = [];
    protected providers = new Map<string, unknown>();
    protected pendingServices: unknown[] = [];
    private orchestrator: BootOrchestrator;

    constructor(config: AppConfig) {
        this.nodeID = config.nodeID;
        this.namespace = config.namespace || 'default';
        this.config = config;
        this.orchestrator = new BootOrchestrator(this);
        
        // Default logger if none provided in config
        this.logger = config['logger'] || {
            debug: (msg: string, data?: any) => console.debug(`[${this.nodeID}] ${msg}`, data || ''),
            info: (msg: string, data?: any) => console.info(`[${this.nodeID}] ${msg}`, data || ''),
            warn: (msg: string, data?: any) => console.warn(`[${this.nodeID}] ${msg}`, data || ''),
            error: (msg: string, data?: any) => console.error(`[${this.nodeID}] ${msg}`, data || ''),
            child: () => this.logger
        };

        this.registerProvider('logger', this.logger);
        this.registerProvider('app' as any, this);
    }

    public use(moduleOrMiddleware: IMeshModule | ((ctx: any, next: () => Promise<any>) => Promise<any>)): this {
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

    /**
     * Registers a service instance.
     */
    public registerService(service: unknown): this {
        try {
            const broker = this.getProvider<IServiceBroker>('broker');
            broker.registerService(service);
        } catch (err) {
            this.pendingServices.push(service);
        }
        return this;
    }

    public registerProvider<T>(token: ProviderToken<T>, provider: T): void {
        const key = typeof token === 'string' ? token : token.name;
        this.providers.set(key, provider);

        if (key === 'broker') {
            const broker = provider as IServiceBroker;
            while (this.pendingMiddleware.length > 0) {
                broker.use(this.pendingMiddleware.shift()!);
            }
            while (this.pendingServices.length > 0) {
                broker.registerService(this.pendingServices.shift());
            }
        }
    }

    public getProvider<T>(token: ProviderToken<T>): T {
        const key = typeof token === 'string' ? token : token.name;
        const provider = this.providers.get(key);
        if (provider === undefined) {
            throw new Error(`[MeshApp] Provider not found for token: ${key}`);
        }
        return provider as T;
    }

    /**
     * Delegate RPC requests directly to the ServiceBroker.
     */
    public async call<
        TAction extends keyof MeshActionRegistry, 
        TParams extends MeshActionRegistry[TAction] extends { params: infer P } ? P : any,
        TReturn extends MeshActionRegistry[TAction] extends { returns: infer R } ? R : any
    >(action: TAction, params: TParams): Promise<TReturn> {
        const broker = this.getProvider<IServiceBroker>('broker');
        return await broker.call(action, params);
    }

    /**
     * Delegate event broadcasting to the ServiceBroker.
     */
    public emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void {
        const broker = this.getProvider<IServiceBroker>('broker');
        broker.emit(event, payload);
    }

    public async start(): Promise<void> {
        this.logger.info('MeshApp starting...');
        await this.orchestrator.executeBootSequence(this.modules);
        this.logger.info('MeshApp started successfully.');
    }

    public async stop(): Promise<void> {
        this.logger.info('MeshApp stopping...');
        await this.orchestrator.executeTeardown(this.modules);
        this.logger.info('MeshApp stopped.');
    }
}
