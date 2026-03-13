export interface Context<TParams = unknown, TMeta = Record<string, unknown>> {
  readonly id: string;
  readonly actionName: string;
  readonly params: TParams;
  readonly meta: TMeta;
  readonly callerID: string | null;
  readonly nodeID: string;

  call<TResult = unknown>(action: string, params: unknown): Promise<TResult>;
  emit(event: string, payload: unknown): void;
}
