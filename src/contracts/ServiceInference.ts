import { z } from 'zod';
import { Context } from './Context';

export type InferZod<T> = T extends z.ZodType<infer P> ? P : unknown;

export type ActionHandler<TParamsSchema, TReturnSchema> = (
  ctx: Context<InferZod<TParamsSchema>>
) => Promise<InferZod<TReturnSchema>>;

export interface ActionDefinition {
  params: z.ZodTypeAny;
  returns: z.ZodTypeAny;
}

export type ServiceImplementation<TContract extends { actions: Record<string, ActionDefinition> }> = {
  [K in keyof TContract['actions']]: ActionHandler<
    TContract['actions'][K]['params'],
    TContract['actions'][K]['returns']
  >;
};
