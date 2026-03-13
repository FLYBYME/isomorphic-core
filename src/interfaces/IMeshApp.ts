import { IMeshModule } from './IMeshModule';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { ILogger } from '../types/core.types';

export type ProviderToken<T = any> = string | { name: string; prototype: T };

export interface AppConfig {
    nodeID: string;
    namespace?: string;
    [key: string]: any;
}

export interface IMeshApp {
    readonly nodeID: string;
    readonly namespace: string;
    readonly config: AppConfig;
    readonly logger: ILogger;

    use<TModule extends IMeshModule>(module: TModule): this;
    registerService(service: unknown): this;
    
    registerProvider<T>(token: ProviderToken<T>, provider: T): void;
    getProvider<T>(token: ProviderToken<T>): T;

    call<
        TAction extends keyof MeshActionRegistry, 
        TParams extends MeshActionRegistry[TAction] extends { params: infer P } ? P : any,
        TReturn extends MeshActionRegistry[TAction] extends { returns: infer R } ? R : any
    >(action: TAction, params: TParams): Promise<TReturn>;

    emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void;
    
    start(): Promise<void>;
    stop(): Promise<void>;
}
