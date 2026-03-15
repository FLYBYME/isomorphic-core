import { IContext } from './IContext';
import { ILogger } from './ILogger';
import { IServiceBroker } from './IServiceBroker';

export interface IActionDefinition<TParams = any, TReturns = any> {
    params: any;
    returns: any;
    handler: IActionHandler;
}

export type IActionHandler = (ctx: IContext<any, any>) => Promise<any>;

export type ServiceState = 
    | 'started'
    | 'stopped'
    | 'starting'
    | 'stopping'
    | 'pausing'
    | 'paused'
    | 'errored';

export interface ICronDefinition {
    schedule: string;
    action: string;
    params?: Record<string, unknown>;
    timeZone?: string;
}

export interface IServiceSchema {
    name: string;
    version?: string | number;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    dependencies?: string[];
    actions?: Record<string, IActionDefinition<unknown, unknown>>;
    events?: Record<string, unknown>;
    methods?: Record<string, Function>;
    cron?: ICronDefinition[];
    
    // Lifecycle hooks
    created?: (app: unknown) => void | Promise<void>;
    started?: () => void | Promise<void>;
    stopped?: () => void | Promise<void>;
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
