import { IMeshModule } from './IMeshModule';

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

    use<TModule extends IMeshModule>(module: TModule): this;
    
    registerProvider<T>(token: ProviderToken<T>, provider: T): void;
    getProvider<T>(token: ProviderToken<T>): T;
    
    start(): Promise<void>;
    stop(): Promise<void>;
}
