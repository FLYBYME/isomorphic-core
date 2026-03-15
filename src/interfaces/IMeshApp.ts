import { IMeshModule } from './IMeshModule';
import { ILogger } from './ILogger';
import { IServiceSchema } from './IService';
import { IProviderToken } from './IProviderToken';

export interface AppConfig extends Record<string, unknown> {
    nodeID: string;
    namespace?: string;
}

/**
 * IMeshApp — Core container for the mesh application.
 */
export interface IMeshApp {
    readonly nodeID: string;
    readonly config: AppConfig;
    readonly logger: ILogger;

    /** Registers a module or middleware. */
    use(moduleOrMiddleware: IMeshModule | ((ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>)): this;
    
    /** Registers a service. */
    registerService(service: IServiceSchema): this;
    
    /** Registers a provider for DI. */
    registerProvider<T>(token: IProviderToken<T>, provider: T): void;
    
    /** Gets a provider from DI. */
    getProvider<T>(token: IProviderToken<T>): T;
 
    /** Starts the application. */
    start(): Promise<void>;
    
    /** Stops the application. */
    stop(): Promise<void>;
}
