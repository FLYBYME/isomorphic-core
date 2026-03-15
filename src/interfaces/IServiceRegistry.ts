import { IServiceSchema } from './IService';

/**
 * Service Node Discovery Metadata
 */
export interface IServiceNode {
    nodeID: string;
    services: string[];
    metadata?: Record<string, unknown>;
}

/**
 * IServiceRegistry — Interface for service discovery and tracking.
 */
export interface IServiceRegistry {
    registerService(schema: IServiceSchema): void;
    unregisterService(serviceName: string): void;
    getService(serviceName: string): IServiceSchema | undefined;
    listServices(): IServiceSchema[];

    /** Selects a node for a given action using internal load-balancing (e.g. DHT). */
    selectNode(actionName: string, context?: { action: string, params: unknown }): IServiceNode | undefined;

    /** Starts the registry operations (e.g. pruning, monitoring). */
    start(): Promise<void>;

    /** Stops the registry operations gracefully. */
    stop(): Promise<void>;
}
