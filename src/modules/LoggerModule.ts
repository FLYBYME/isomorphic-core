import { IMeshModule, IMeshApp } from '../interfaces';
import { ILogger } from '../types/core.types';

export enum LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4
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

    private format(msg: string, data?: Record<string, unknown>) {
        const timestamp = new Date().toISOString();
        const ctx = Object.keys(this.context).length ? ` [${JSON.stringify(this.context)}]` : '';
        return `[${timestamp}]${ctx} ${msg}`;
    }

    debug(msg: string, data?: Record<string, unknown>): void {
        if (this.shouldLog(LogLevel.DEBUG)) console.debug(this.format(msg), data || '');
    }

    info(msg: string, data?: Record<string, unknown>): void {
        if (this.shouldLog(LogLevel.INFO)) console.info(this.format(msg), data || '');
    }

    warn(msg: string, data?: Record<string, unknown>): void {
        if (this.shouldLog(LogLevel.WARN)) console.warn(this.format(msg), data || '');
    }

    error(msg: string, data?: Record<string, unknown>): void {
        if (this.shouldLog(LogLevel.ERROR)) console.error(this.format(msg), data || '');
    }

    trace(msg: string, data?: Record<string, unknown>): void {
        if (this.shouldLog(LogLevel.TRACE)) console.log(`[TRACE] ${this.format(msg)}`, data || '');
    }

    child(context: Record<string, unknown>): ILogger {
        return new ConsoleLogger({ ...this.context, ...context }, this.level);
    }
}

/**
 * LoggerModule — Provides the standardized logging service to the app.
 */
export class LoggerModule implements IMeshModule {
    public readonly name = 'logger';
    private logger: ConsoleLogger;

    constructor(level: LogLevel = LogLevel.INFO) {
        this.logger = new ConsoleLogger({}, level);
    }

    onInit(app: IMeshApp): void {
        app.registerProvider('logger', this.logger);
        // Override the default app.logger if it exists
        (app as any).logger = this.logger;
    }
}
