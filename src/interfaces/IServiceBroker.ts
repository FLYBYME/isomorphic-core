import { IMeshNetwork, IMeshPacket } from './IMeshNetwork';
import { ILogger } from './ILogger';
import { IServiceRegistry } from './IServiceRegistry';
import { IServiceSchema } from './IService';
import { IContext } from './IContext';
import { IServiceActionRegistry, IServiceEventRegistry } from './IGlobalRegistry';
import { IBrokerPlugin } from './IBrokerPlugin';
import { IMeshApp } from './IMeshApp';
import { IMiddleware } from './IInterceptor';

/**
 * IServiceBroker — Interface for the central communication kernel.
 * Refactored for Bipartite Pipeline and High-Speed execution.
 */
export interface IServiceBroker {
    readonly app: IMeshApp;
    readonly logger: ILogger;
    readonly registry: IServiceRegistry;
    readonly network: IMeshNetwork;

    /** Registers a plugin into the broker's lifecycle. */
    pipe(plugin: IBrokerPlugin): this;

    /** Registers a middleware in the GLOBAL pipeline (Always runs). */
    use(mw: IMiddleware): void;

    /** Registers a middleware in the LOCAL pipeline (Runs only for local services). */
    useLocal(mw: IMiddleware): void;

    /** Registers a service schema. */
    registerService(service: IServiceSchema): void;

    /** Fully processes a context through the pipeline. */
    handlePipeline(ctx: IContext<Record<string, unknown>, Record<string, unknown>>): Promise<unknown>;

    /** Low-level execution (used by NetworkPlugin for inbound requests) */
    handleIncomingRPC(packet: IMeshPacket): Promise<unknown>;

    /** Low-level dispatch to remote node. */
    executeRemote(nodeID: string, actionName: string, params: unknown, meta?: Record<string, unknown>): Promise<unknown>;

    /** Typed mesh action call. */
    call<K extends keyof IServiceActionRegistry>(
        action: K, 
        params: any
    ): Promise<any>;

    /** Fallback untyped call. */
    call<TResult = unknown>(action: string, params: unknown): Promise<TResult>;

    /** Typed mesh event emit. */
    emit<K extends keyof IServiceEventRegistry>(event: K, payload: any): void;

    /** Untyped event emit. */
    emit(event: string, payload: unknown): void;

    /** Subscription to events. */
    on(topic: string, handler: (payload: unknown) => void): (() => void);
    off(topic: string, handler: (payload: unknown) => void): void;

    /** Gets the current execution context. */
    getContext(): IContext<Record<string, unknown>, Record<string, unknown>> | undefined;

    /** Starts the broker and its plugins. */
    start(): Promise<void>;

    /** Stops the broker. */
    stop(): Promise<void>;

    /** Manual wiring (called by plugins) */
    setNetwork(network: IMeshNetwork): void;
    setRegistry(registry: IServiceRegistry): void;
}
