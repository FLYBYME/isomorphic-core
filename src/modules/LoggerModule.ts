import { IMeshModule, IMeshApp, ILogger, IServiceBroker, IBrokerPlugin } from '../interfaces';
import { LoggerPlugin } from '../LoggerPlugin';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Standardized Logger Implementation.
 */
export class ConsoleLogger implements ILogger {
    constructor(
        private context: Record<string, unknown> = {},
        private level: LogLevel = LogLevel.INFO
    ) {}

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    private format(msg: string) {
        const timestamp = new Date().toISOString();
        const ctx = Object.keys(this.context).length ? ` [${JSON.stringify(this.context)}]` : '';
        return `[${timestamp}]${ctx} ${msg}`;
    }

    debug(msg: string, data?: unknown): void {
        if (this.shouldLog(LogLevel.DEBUG)) console.debug(this.format(msg), data || '');
    }

    info(msg: string, data?: unknown): void {
        if (this.shouldLog(LogLevel.INFO)) console.info(this.format(msg), data || '');
    }

    warn(msg: string, data?: unknown): void {
        if (this.shouldLog(LogLevel.WARN)) console.warn(this.format(msg), data || '');
    }

    error(msg: string, data?: unknown): void {
        if (this.shouldLog(LogLevel.ERROR)) console.error(this.format(msg), data || '');
    }

    child(context: Record<string, unknown>): ILogger {
        return new ConsoleLogger({ ...this.context, ...context }, this.level);
    }
}

/**
 * Internal interface for app with logger property.
 */
interface AppWithLogger {
    logger: ILogger;
}

/**
 * LoggerModule — Provides the standardized logging service to the app.
 * ZERO 'any' casts.
 */
export class LoggerModule implements IMeshModule {
    public readonly name = 'logger';
    public logger!: ILogger;
    public serviceBroker!: IServiceBroker;
    private _logger: ConsoleLogger;
    private plugin!: LoggerPlugin;

    constructor(level: LogLevel = LogLevel.INFO) {
        this._logger = new ConsoleLogger({}, level);
        this.plugin = new LoggerPlugin(this._logger);
    }

    onInit(app: IMeshApp): void {
        this.logger = this._logger;
        app.registerProvider('logger', this.logger);
        
        // Use a safe structural cast to set the logger if the app supports it
        const appWithLogger = app as unknown as AppWithLogger;
        appWithLogger.logger = this.logger;

        this.serviceBroker = app.getProvider<IServiceBroker>('broker');
        if (this.serviceBroker) {
            this.serviceBroker.pipe(this.plugin);
        }
    }
}
