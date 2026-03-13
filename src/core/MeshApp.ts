import { IMeshApp, IMeshModule, AppConfig, ProviderToken } from '../interfaces/index';
import { BootOrchestrator } from './BootOrchestrator';
import { IServiceBroker } from '../interfaces/IServiceBroker';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';

/**
 * MeshApp — The "Motherboard" shell that provides DI and lifecycle management.
 */
export class MeshApp implements IMeshApp {
    public readonly nodeID: string;
    public readonly namespace: string;
    public readonly config: AppConfig;

    protected modules: IMeshModule[] = [];
    protected providers: Map<string, any> = new Map();
    protected pendingServices: any[] = [];
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

    /**
     * Registers a service instance.
     * If the broker is already registered, it registers directly.
     * Otherwise, it queues it for when the broker is available.
     */
    public registerService(service: any): this {
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

        // If we just registered the broker, flush pending services
        if (key === 'broker') {
            const broker = provider as IServiceBroker;
            while (this.pendingServices.length > 0) {
                broker.registerService(this.pendingServices.shift());
            }
        }
    }

    public getProvider<T>(token: ProviderToken<T>): T {
        const key = typeof token === 'string' ? token : token.name;
        const provider = this.providers.get(key);
        if (!provider) {
            throw new Error(`[MeshApp] Provider not found for token: ${key}`);
        }
        return provider;
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
        await this.orchestrator.executeBootSequence(this.modules);
    }

    public async stop(): Promise<void> {
        await this.orchestrator.executeTeardown(this.modules);
    }
}
