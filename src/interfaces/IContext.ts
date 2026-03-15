import { IServiceActionRegistry, IServiceEventRegistry } from './IGlobalRegistry';

/**
 * IContext — Core execution context for actions and events.
 * Static shape for V8 optimization.
 */
export interface IContext<TParams = unknown, TMeta = Record<string, unknown>> {
    readonly id: string;
    readonly actionName: string;
    readonly params: TParams;
    readonly meta: TMeta;
    readonly correlationID: string;
    readonly callerID: string | null;
    readonly nodeID: string;
    
    // Pipeline control properties (pre-defined for stability)
    targetNodeID?: string;
    result?: unknown; 
    error?: unknown;

    // Database and Repository injection (optional)
    db?: unknown; 
    repos?: Record<string, unknown>;

    /** Calls a mesh action with strict inference from context. */
    call<K extends keyof IServiceActionRegistry>(
        action: K, 
        params: IServiceActionRegistry[K] extends { params: import('zod').ZodType<infer P> } ? P : any
    ): Promise<IServiceActionRegistry[K] extends { returns: import('zod').ZodType<infer R> } ? R : any>;

    /** Fallback untyped call. */
    call<TResult = unknown>(action: string, params: unknown): Promise<TResult>;

    /** Emits a mesh event with strict inference. */
    emit<K extends keyof IServiceEventRegistry>(event: K, payload: any): void;

    /** Fallback untyped emit. */
    emit(event: string, payload: unknown): void;
}
