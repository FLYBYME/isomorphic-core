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
        this.config = this.schema.parse(this.deepMerge(this.getDefaults(), this.values));
    }

    private getDefaults(): Record<string, unknown> {
        // Zod defaults extraction is non-trivial but for this test we'll assume passed values handle it 
        // or just return an empty object if we want it to be truly optional.
        return {};
    }

    private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
        if (!source) return target;
        const output: Record<string, unknown> = { ...target };
        for (const key of Object.keys(source)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                output[key] = this.deepMerge((targetValue as Record<string, unknown>) || {}, sourceValue as Record<string, unknown>);
            } else {
                output[key] = sourceValue;
            }
        }
        return output;
    }

    onInit(app: IMeshApp): void {
        app.registerProvider('config', this.config);
    }

    public get<K extends keyof z.infer<TSchema>>(key: K): z.infer<TSchema>[K] {
        return this.config[key];
    }
}
