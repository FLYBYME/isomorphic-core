import { z } from 'zod';
import { IMeshModule, IMeshApp, ILogger, IServiceBroker } from '../interfaces';

/**
 * ConfigModule — Provides runtime validated settings to the MeshApp.
 */
export class ConfigModule<TSchema extends z.ZodObject<any>> implements IMeshModule {
    public readonly name = 'config';
    public logger!: ILogger;
    public serviceBroker!: IServiceBroker;
    private config: z.infer<TSchema>;

    constructor(private schema: TSchema, private values: Record<string, unknown>) {
        this.config = this.schema.parse(this.values);
    }

    onInit(app: IMeshApp): void {
        app.registerProvider('config', this.config);
    }

    public get<K extends keyof z.infer<TSchema>>(key: K): z.infer<TSchema>[K] {
        return this.config[key];
    }
}
