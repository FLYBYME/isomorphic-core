import { IMeshApp, IMeshModule, AppConfig, ProviderToken } from '../interfaces/index';
import { BootOrchestrator } from './BootOrchestrator';

/**
 * MeshApp — The "Motherboard" shell that provides DI and lifecycle management.
 */
export class MeshApp implements IMeshApp {
    public readonly nodeID: string;
    public readonly namespace: string;
    public readonly config: AppConfig;

    protected modules: IMeshModule[] = [];
    protected providers: Map<string, any> = new Map();
    private orchestrator: BootOrchestrator;

    constructor(config: AppConfig) {
        this.nodeID = config.nodeID;
        this.namespace = config.namespace || 'default';
        this.config = config;
        this.orchestrator = new BootOrchestrator(this);
    }

    public use<TModule extends IMeshModule>(module: TModule): this {
        this.modules.push(module);
        return this;
    }

    public registerProvider<T>(token: ProviderToken<T>, provider: T): void {
        const key = typeof token === 'string' ? token : token.name;
        this.providers.set(key, provider);
    }

    public getProvider<T>(token: ProviderToken<T>): T {
        const key = typeof token === 'string' ? token : token.name;
        const provider = this.providers.get(key);
        if (!provider) {
            throw new Error(`[MeshApp] Provider not found for token: ${key}`);
        }
        return provider;
    }

    public async start(): Promise<void> {
        await this.orchestrator.executeBootSequence(this.modules);
    }

    public async stop(): Promise<void> {
        await this.orchestrator.executeTeardown(this.modules);
    }
}
