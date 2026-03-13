import { IMeshApp, IMeshModule, AppConfig, ProviderToken } from '../interfaces/index';
import { BootOrchestrator } from '../core/BootOrchestrator';
import { ILogger } from '../types/core.types';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { IServiceBroker } from '../interfaces/IServiceBroker';

/**
 * MeshClientApp — Specialized shell for frontend/browser environments.
 * Provides Dependency Injection and Lifecycle management for the browser.
 */
export class MeshClientApp implements IMeshApp {
    public readonly nodeID: string;
    public readonly namespace: string;
    public readonly config: AppConfig;
    public readonly logger: ILogger;

    private readonly providers = new Map<string, unknown>();
    private readonly modules: IMeshModule[] = [];
    private readonly orchestrator: BootOrchestrator;

    constructor(config: AppConfig) {
        this.nodeID = config.nodeID || `client_${Math.random().toString(36).substring(2, 11)}`;
        this.namespace = config.namespace || 'default';
        this.config = config;
        this.orchestrator = new BootOrchestrator(this);
        
        // Console Logger for Client
        this.logger = config.logger || {
            trace: (msg: string, data?: unknown) => console.trace(`[MESH:${this.nodeID}] ${msg}`, data || ''),
            debug: (msg: string, data?: unknown) => console.debug(`[MESH:${this.nodeID}] ${msg}`, data || ''),
            info: (msg: string, data?: unknown) => console.info(`[MESH:${this.nodeID}] ${msg}`, data || ''),
            warn: (msg: string, data?: unknown) => console.warn(`[MESH:${this.nodeID}] ${msg}`, data || ''),
            error: (msg: string, data?: unknown) => console.error(`[MESH:${this.nodeID}] ${msg}`, data || ''),
            child: () => this.logger
        };
    }

    public use<TModule extends IMeshModule>(module: TModule): this {
        this.modules.push(module);
        return this;
    }

    public registerService(service: unknown): this {
        try {
            const broker = this.getProvider<IServiceBroker>('broker');
            broker.registerService(service);
        } catch (err) {
            // Broker not yet registered - common during boot
        }
        return this;
    }

    public registerProvider<T>(token: ProviderToken<T>, provider: T): void {
        const key = typeof token === 'string' ? token : token.name;
        this.providers.set(key, provider);
    }

    public getProvider<T>(token: ProviderToken<T>): T {
        const key = typeof token === 'string' ? token : token.name;
        const provider = this.providers.get(key);
        if (provider === undefined) {
            throw new Error(`[MeshClientApp] Provider not found: ${key}`);
        }
        return provider as T;
    }

    public async call<
        TAction extends keyof MeshActionRegistry, 
        TParams extends MeshActionRegistry[TAction] extends { params: infer P } ? P : any,
        TReturn extends MeshActionRegistry[TAction] extends { returns: infer R } ? R : any
    >(action: TAction, params: TParams): Promise<TReturn> {
        const broker = this.getProvider<IServiceBroker>('broker');
        return await broker.call(action, params);
    }

    public emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void {
        const broker = this.getProvider<IServiceBroker>('broker');
        broker.emit(event, payload);
    }

    public async start(): Promise<void> {
        this.logger.info('🚀 MeshClientApp: Starting boot sequence...');
        await this.orchestrator.executeBootSequence(this.modules);
        this.logger.info('✅ MeshClientApp: Ready.');
    }

    public async stop(): Promise<void> {
        this.logger.info('🛑 MeshClientApp: Stopping...');
        await this.orchestrator.executeTeardown(this.modules);
    }
}
