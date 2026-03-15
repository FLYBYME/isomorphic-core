import { IContext } from './IContext';
import { ILogger } from './ILogger';

export type INextFunction<TReturn = unknown> = () => Promise<TReturn>;

export type IMiddleware<TParams = unknown, TMeta = Record<string, unknown>, TReturn = unknown> = (
    ctx: IContext<TParams, TMeta>,
    next: INextFunction<TReturn>
) => Promise<TReturn>;

/**
 * IInterceptor — Strictly typed middleware interceptor.
 * Can be used for Broker actions (handler) or Network packets (onInbound/onOutbound).
 */
export interface IInterceptor<TIn = any, TOut = any> {
    name: string;
    
    /** Used for ServiceBroker action middleware */
    handler?(context: IContext<any>, next: INextFunction<any>): Promise<any>;

    /** Used for Network packet interception */
    onInbound?(packet: TIn): Promise<TIn> | TIn;
    onOutbound?(packet: TOut): Promise<TOut> | TOut;
}
