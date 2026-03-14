/**
 * IInterceptor — The "Onion" model pipeline for data flow.
 * Components that sit in a pipeline and mutate or inspect data as it passes through.
 */
export interface IInterceptor<T = any, R = any> {
    /** Unique name for telemetry and debugging */
    name: string;
    
    /** 
     * Mutates or inspects data before the primary action occurs.
     * e.g., Compress payload before sending over the network.
     */
    onOutbound?: (data: T) => Promise<T> | T;
    
    /** 
     * Mutates or inspects data after the primary action occurs.
     * e.g., Decompress payload received from the network.
     */
    onInbound?: (data: R) => Promise<R> | R;
}
