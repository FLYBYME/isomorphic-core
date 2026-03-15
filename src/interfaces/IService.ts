import { IContext } from './IContext';
import { ILogger } from './ILogger';
import { IServiceBroker } from './IServiceBroker';

export interface IActionDefinition<TParams = unknown, TReturns = unknown> {
    params: import('zod').ZodType<TParams>;
    returns: import('zod').ZodType<TReturns>;
    handler: IActionHandler;
    highSecurity?: boolean;
}

export type IActionHandler = (ctx: IContext<unknown>) => Promise<unknown>;

export type ServiceState = 
    | 'initializing'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'pausing'
    | 'paused'
    | 'errored';

export interface IServiceSchema {
    name: string;
    version?: string | number;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    dependencies?: string[];
    actions?: Record<string, IActionDefinition<unknown, unknown>>;
    events?: Record<string, unknown>;
    methods?: Record<string, Function>;
    
    // Lifecycle hooks
    created?: (app: unknown) => void | Promise<void>;
    started?: () => void | Promise<void>;
    stopped?: () => void | Promise<void>;
    paused?: () => void | Promise<void>;
    resumed?: () => void | Promise<void>;
}

export interface IServiceInstance<TSchema extends IServiceSchema = IServiceSchema> {
    readonly name: string;
    readonly fullName: string;
    readonly version?: string | number;
    readonly schema: TSchema;
    state: ServiceState;
    logger: ILogger;
    broker: IServiceBroker;

    start(): Promise<void>;
    stop(): Promise<void>;
}
