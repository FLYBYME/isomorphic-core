/**
 * ReactiveState — Proxy-based state container with auto-subscription.
 * Implementation of the "Magic Sauce" for isomorphic-ui.
 */
export class ReactiveState<T extends Record<string, unknown>> {
    private _data: T;
    private listeners = new Set<() => void>();

    // Shared static to track the currently active subscriber (e.g. a component being built)
    public static currentSubscriber: { addSubscription(unsub: () => void): void, update(): void } | null = null;

    constructor(initialData: T) {
        this._data = this.createProxy(initialData);
    }

    public get data(): T {
        return this._data;
    }

    public set data(newData: T) {
        this._data = this.createProxy(newData);
        this.notify();
    }

    /**
     * Subscribe to changes.
     */
    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    private createProxy(obj: Record<string, unknown>): any {
        if (typeof obj !== 'object' || obj === null || obj instanceof Date || obj instanceof RegExp) {
            return obj;
        }

        // Removed recursive proxying to make it shallow-only as per "intended behavior" check

        return new Proxy(obj, {
            get: (target: Record<string, unknown>, prop: string | symbol) => {
                // Dependency Tracking: If a subscriber is currently active, link it.
                if (ReactiveState.currentSubscriber) {
                    const subscriber = ReactiveState.currentSubscriber;
                    const unsub = this.subscribe(() => subscriber.update());
                    subscriber.addSubscription(unsub);
                }
                return target[prop as string];
            },
            set: (target: Record<string, unknown>, prop: string | symbol, value: unknown) => {
                if (target[prop as string] !== value) {
                    target[prop as string] = value;
                    this.notify();
                }
                return true;
            }
        });
    }
}
