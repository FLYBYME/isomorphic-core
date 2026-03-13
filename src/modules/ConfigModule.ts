import { z } from 'zod';
import { IMeshModule, IMeshApp } from '../interfaces';

/**
 * ConfigModule — Validates .env or config objects using Zod during onInit.
 */
export class ConfigModule<TSchema extends z.ZodObject<any>> implements IMeshModule {
    public readonly name = 'config';
    private validatedConfig: z.infer<TSchema> | null = null;

    constructor(
        private schema: TSchema,
        private source: Record<string, unknown> = (typeof process !== 'undefined' ? process.env : {}) as any
    ) {}

    onInit(app: IMeshApp): void {
        try {
            this.validatedConfig = this.schema.parse(this.source);
            app.registerProvider('config', this.validatedConfig);
            app.logger.info('[ConfigModule] Configuration validated successfully.');
        } catch (err) {
            app.logger.error('[ConfigModule] Configuration validation failed!', { 
                errors: (err as z.ZodError).errors 
            });
            // Abort boot if config is invalid
            throw err;
        }
    }

    public get current(): z.infer<TSchema> {
        if (!this.validatedConfig) {
            throw new Error('[ConfigModule] Config not yet validated. Access it after onInit.');
        }
        return this.validatedConfig;
    }
}
