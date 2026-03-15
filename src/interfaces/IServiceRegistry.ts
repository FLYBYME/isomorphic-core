import { IServiceSchema } from './IService';

/**
 * Service Node Discovery Metadata
 */
export interface IServiceNode {
    nodeID: string;
    services: string[];
    metadata?: Record<string, unknown>;
}

export interface NodeInfo {
    nodeID: string;
    hostname?: string;
    type: string;
    nodeType?: string;
    namespace: string;
    addresses: string[];
    available?: boolean;
    timestamp?: number;
    nodeSeq?: number;
    services: any[]; // Avoid circular dependency with full ServiceInfo
    parentID?: string;
    cpu?: number;
    activeRequests?: number;
    lastHeartbeatTime?: number;
    publicKey?: string;
}

/**
 * IServiceRegistry — Interface for service discovery and tracking.
 */
export interface IServiceRegistry {
    on(event: string, handler: (...args: any[]) => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;

    registerService(schema: IServiceSchema): void;
    unregisterService(serviceName: string): void;
    getService(serviceName: string): IServiceSchema | undefined;
    listServices(): IServiceSchema[];

    /** Node-level discovery */
    getNode(nodeID: string): NodeInfo | undefined;
    getNodes(): NodeInfo[];
    getAvailableNodes(): NodeInfo[];
    registerNode(node: NodeInfo): void;
    unregisterNode(nodeID: string): void;
    heartbeat(nodeID: string, data?: { cpu?: number; activeRequests?: number }): void;
    findNodesForAction(actionName: string): NodeInfo[];

    /** Selects a node for a given action using internal load-balancing (e.g. DHT). */
    selectNode(actionName: string, context?: { action: string, params: unknown }): IServiceNode | undefined;

    /** Starts the registry operations (e.g. pruning, monitoring). */
    start(): Promise<void>;

    /** Stops the registry operations gracefully. */
    stop(): Promise<void>;
}
