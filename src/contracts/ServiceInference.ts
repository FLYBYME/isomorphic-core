import { z } from 'zod';
import { IContext, IActionDefinition, IActionHandler } from '../interfaces/index';

export type InferZod<T> = T extends z.ZodType<infer P> ? P : unknown;

/**
 * ServiceImplementation — Maps an action definition to a typed handler.
 */
export type ServiceImplementation<TContract extends { actions?: Record<string, IActionDefinition<any, any>> }> = {
    [K in keyof TContract['actions']]: (
        ctx: IContext<InferZod<NonNullable<TContract['actions']>[K]['params']>>
    ) => Promise<InferZod<NonNullable<TContract['actions']>[K]['returns']>>
};

export type { IActionHandler };
