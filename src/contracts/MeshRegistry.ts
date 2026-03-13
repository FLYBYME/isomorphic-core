// This interface is left empty in the core package.
// Developers will "augment" it in their own apps.
export interface MeshActionRegistry { [key: string]: any }
export interface MeshEventRegistry { [key: string]: any }

// The Transceiver uses this global registry to type the `call` method.
export interface IMeshTransceiver {
  call<
    TAction extends keyof MeshActionRegistry, 
    TParams extends MeshActionRegistry[TAction] extends { params: infer P } ? P : any,
    TReturn extends MeshActionRegistry[TAction] extends { returns: infer R } ? R : any
  >(action: TAction, params: TParams): Promise<TReturn>;

  emit<
    TEvent extends keyof MeshEventRegistry,
    TPayload extends MeshEventRegistry[TEvent]
  >(event: TEvent, payload: TPayload): void;
}
