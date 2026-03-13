export interface IServiceBroker {
    call<TResult = any>(action: string, params?: Record<string, any>): Promise<TResult>;
    emit(event: string, params?: Record<string, any>): void;
}
