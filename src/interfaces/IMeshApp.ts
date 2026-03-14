import { IMeshModule } from './IMeshModule';
import { MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { ILogger } from '../types/core.types';

// Replaced `any` with `unknown` for safer default typing
export type ProviderToken<T = unknown> = string | { name: string; prototype: T };

export interface AppConfig {
    nodeID: string;
    namespace?: string;
    // Replaced `any` with `unknown` to force type-checking upon access
    [key: string]: unknown;
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

    // Strictly infers parameters and returns. 
    // Fallback for params is `never` (to prevent passing arguments to parameter-less actions)
    // Fallback for returns is `unknown`
    call<
        TAction extends keyof MeshActionRegistry,
        TParams extends (MeshActionRegistry[TAction] extends { params: infer P } ? P : never),
        TReturn extends (MeshActionRegistry[TAction] extends { returns: infer R } ? R : unknown)
    >(action: TAction, params: TParams): Promise<TReturn>;

    emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void;

    start(): Promise<void>;
    stop(): Promise<void>;
}