import { IMeshTransceiver, MeshActionRegistry, MeshEventRegistry } from '../contracts/MeshRegistry';
import { Context } from 'isomorphic-registry';

export interface IServiceBroker extends IMeshTransceiver {
    call<
        TAction extends keyof MeshActionRegistry, 
        TParams extends MeshActionRegistry[TAction] extends { params: infer P } ? P : any,
        TReturn extends MeshActionRegistry[TAction] extends { returns: infer R } ? R : any
    >(action: TAction, params: TParams): Promise<TReturn>;

    emit<
        TEvent extends keyof MeshEventRegistry,
        TPayload extends MeshEventRegistry[TEvent]
    >(event: TEvent, payload: TPayload): void;
    
    registerService(service: unknown): void;

    /**
     * Retrieves the active execution context for the current operation.
     */
    getContext(): Context<any> | undefined;

    on(event: string, handler: (payload: any) => void): (() => void);
    off(event: string, handler: (payload: any) => void): void;
    use(middleware: (ctx: Context<any>, next: () => Promise<any>) => Promise<any>): void;
}
