
export type StateListener = () => void;

/**
 * ReactiveState — A Proxy-based engine for granular state tracking and reactivity.
 */
export class ReactiveState<T extends object> {
    public data: T;
    private listeners: Map<string, Set<StateListener>> = new Map();
    private globalListeners: Set<StateListener> = new Set();
    
    // Track accessed paths during a synchronous block (e.g. build() or render())
    private static accessStack: Set<string>[] = [];

    constructor(initialState: T) {
        this.data = this.createProxy(initialState);
    }

    /**
     * Records which paths are accessed during the execution of the callback.
     * Returns the set of paths.
     */
    public static track(cb: () => void): Set<string> {
        const accessedPaths = new Set<string>();
        this.accessStack.push(accessedPaths);
        try {
            cb();
        } finally {
            this.accessStack.pop();
        }
        return accessedPaths;
    }

    private createProxy<U extends object>(obj: U, path: string = ''): U {
        const self = this;
        return new Proxy(obj, {
            get(target, prop, receiver) {
                const key = String(prop);
                // Don't proxy symbols or internal properties
                if (typeof prop === 'symbol' || key.startsWith('_')) {
                    return Reflect.get(target, prop, receiver);
                }

                const fullPath = path ? `${path}.${key}` : key;
                
                // 1. Access Tracking (Legacy Stack-based)
                if (ReactiveState.accessStack.length > 0) {
                    ReactiveState.accessStack[ReactiveState.accessStack.length - 1].add(fullPath);
                }

                // 2. THE MAGIC SAUCE: BrokerComponent Auto-Subscription
                // We use a global helper to avoid direct dependency on isomorphic-ui
                const globalAny = globalThis as any;
                if (globalAny.MeshMagicSauce && globalAny.MeshMagicSauce.currentSubscriber) {
                    const subscriber = globalAny.MeshMagicSauce.currentSubscriber;
                    const unsub = self.subscribe(fullPath, () => subscriber.invalidate());
                    if (subscriber.unsubscribes) {
                        subscriber.unsubscribes.push(unsub);
                    }
                }

                const value = Reflect.get(target, prop, receiver);
                if (value && typeof value === 'object' && !(value instanceof Date)) {
                    return self.createProxy(value as object, fullPath);
                }
                return value;
            },
            set(target, prop, value, receiver) {
                const key = String(prop);
                const fullPath = path ? `${path}.${key}` : key;
                const oldValue = Reflect.get(target, prop, receiver);
                
                if (oldValue === value) return true;

                const result = Reflect.set(target, prop, value, receiver);
                
                // FIX: Array Trap - push/splice trigger 'set' for index AND 'length'.
                // We suppress notification for 'length' to avoid redundant updates.
                if (Array.isArray(target) && key === 'length') {
                    return result;
                }

                // Path-aware notification
                self.notify(fullPath);
                return result;
            }
        }) as U;
    }

    /**
     * Subscribe to a specific path or prefix.
     */
    public subscribe(path: string, listener: StateListener): () => void {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path)!.add(listener);
        return () => {
            const set = this.listeners.get(path);
            if (set) {
                set.delete(listener);
                if (set.size === 0) this.listeners.delete(path);
            }
        };
    }

    /**
     * Global subscription for any change.
     */
    public subscribeGlobal(listener: StateListener): () => void {
        this.globalListeners.add(listener);
        return () => this.globalListeners.delete(listener);
    }

    /**
     * Publicly mark a path as dirty to trigger re-renders.
     */
    public dirty(path: string): void {
        this.notify(path);
    }

    private notify(path: string): void {
        // 1. Notify exact path match
        this.invokeListeners(path);

        // 2. Notify parent paths (bubbling)
        let parentPath = path;
        while (parentPath.includes('.')) {
            parentPath = parentPath.substring(0, parentPath.lastIndexOf('.'));
            this.invokeListeners(parentPath);
        }

        // 3. Notify global listeners
        for (const listener of this.globalListeners) {
            listener();
        }
    }

    private invokeListeners(path: string): void {
        const set = this.listeners.get(path);
        if (set) {
            for (const listener of set) {
                listener();
            }
        }
    }
}
