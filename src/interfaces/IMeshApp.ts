import { IMeshModule } from './IMeshModule';
import { ILogger } from './ILogger';
import { IServiceSchema } from './IService';
import { IProviderToken } from './IProviderToken';

import { IServiceRegistry } from './IServiceRegistry';

export interface AppConfig extends Record<string, unknown> {
    nodeID: string;
    namespace?: string;
}

/**
 * IMeshNode — Base interface for a node in the mesh.
 */
export interface IMeshNode {
    readonly nodeID: string;
    readonly namespace: string;
    readonly logger: ILogger;
    readonly registry: IServiceRegistry;
    getConfig?(): Record<string, unknown>;
    publish<T = unknown>(topic: string, data: T): Promise<void>;
    orchestrator?: any; // To be typed properly if needed, or left as any for flexibility across packages
}

/**
 * IMeshApp — Core container for the mesh application.
 */
export interface IMeshApp extends IMeshNode {
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
