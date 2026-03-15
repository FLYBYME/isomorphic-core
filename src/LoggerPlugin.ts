import { IBrokerPlugin, IServiceBroker, IContext, ILogger } from './interfaces';

/**
 * LoggerPlugin — High-speed pipeline tracing in the GLOBAL pipeline.
 */
export class LoggerPlugin implements IBrokerPlugin {
    public readonly name = 'logger-plugin';

    constructor(private logger: ILogger) {}

    onRegister(broker: IServiceBroker): void {
        broker.use(async (ctx: IContext<unknown, Record<string, unknown>>, next: () => Promise<unknown>) => {
            const start = Date.now();
            this.logger.debug(`[Pipeline] -> ${ctx.actionName} (ID: ${ctx.id})`);
            
            try {
                const result = await next();
                const duration = Date.now() - start;
                this.logger.debug(`[Pipeline] <- ${ctx.actionName} (ID: ${ctx.id}) [${duration}ms]`);
                return result;
            } catch (err: unknown) {
                const duration = Date.now() - start;
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.error(`[Pipeline] x- ${ctx.actionName} (ID: ${ctx.id}) [${duration}ms] - ${msg}`);
                throw err;
            }
        });
    }
}
