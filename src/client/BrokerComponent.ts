import { ReactiveState } from './ReactiveState';

export type ComponentChild = BrokerComponent | string | number | null | undefined;

/**
 * BrokerComponent — The base UI class for building reactive components.
 * Batches updates using microtasks and auto-subscribes to state paths.
 */
export abstract class BrokerComponent {
    public element: HTMLElement | null = null;
    protected props: Record<string, any>;
    private isDirty = false;
    private unsubscribes: (() => void)[] = [];
    private static stateProvider: ReactiveState<any> | null = null;

    constructor(props: Record<string, any> = {}) {
        this.props = props;
    }

    /**
     * Set the global state provider for all components.
     */
    public static setGlobalState(state: ReactiveState<any>): void {
        this.stateProvider = state;
    }

    /**
     * The core build method. Returns the component's structure.
     */
    public abstract build(): ComponentChild | ComponentChild[];

    /**
     * Queues a rendering microtask to batch multiple synchronous mutations.
     */
    public update(): void {
        if (this.isDirty || !this.element) return;
        this.isDirty = true;
        
        queueMicrotask(() => {
            if (this.isDirty) {
                this.performUpdate();
                this.isDirty = false;
            }
        });
    }

    /**
     * Manually subscribe to a state path.
     */
    public subscribe(path: string): void {
        if (!BrokerComponent.stateProvider) return;
        const unsub = BrokerComponent.stateProvider.subscribe(path, () => this.update());
        this.unsubscribes.push(unsub);
    }

    /**
     * Performs the actual DOM reconciliation with auto-binding.
     */
    protected performUpdate(): void {
        if (!this.element) return;
        
        // 1. Clear previous subscriptions
        this.unsubscribeAll();
        
        let newContent: ComponentChild | ComponentChild[];
        
        // 2. Track accessed paths during build()
        const accessedPaths = ReactiveState.track(() => {
            newContent = this.build();
        });

        // 3. Auto-subscribe to all accessed paths
        if (BrokerComponent.stateProvider) {
            for (const path of accessedPaths) {
                this.subscribe(path);
            }
        }

        // 4. Basic DOM diffing/patching
        this.reconcile(this.element, newContent!);
    }

    private unsubscribeAll() {
        for (const unsub of this.unsubscribes) unsub();
        this.unsubscribes = [];
    }

    /**
     * Basic DOM Reconciliation (Diffing)
     */
    private reconcile(parent: HTMLElement, newChildren: ComponentChild | ComponentChild[]): void {
        const list = Array.isArray(newChildren) ? newChildren : [newChildren];
        const existingNodes = Array.from(parent.childNodes);
        
        for (let i = 0; i < Math.max(list.length, existingNodes.length); i++) {
            const newData = list[i];
            const oldNode = existingNodes[i];

            if (newData === undefined || newData === null) {
                if (oldNode) parent.removeChild(oldNode);
                continue;
            }

            if (newData instanceof BrokerComponent) {
                if (!newData.element) {
                    newData.mount(parent);
                } else if (newData.element !== oldNode) {
                    if (oldNode) parent.replaceChild(newData.element, oldNode);
                    else parent.appendChild(newData.element);
                }
                // Nested component updates are handled by their own reactivity
            } else {
                const newText = String(newData);
                if (oldNode && oldNode.nodeType === Node.TEXT_NODE) {
                    if (oldNode.textContent !== newText) {
                        oldNode.textContent = newText;
                    }
                } else {
                    const textNode = document.createTextNode(newText);
                    if (oldNode) parent.replaceChild(textNode, oldNode);
                    else parent.appendChild(textNode);
                }
            }
        }
    }

    public mount(parent: HTMLElement): void {
        if (!this.element) {
            this.element = document.createElement('div');
            this.element.setAttribute('data-component', this.constructor.name);
        }
        parent.appendChild(this.element);
        this.performUpdate();
        if (this.onMount) this.onMount();
    }

    public unmount(): void {
        this.unsubscribeAll();
        if (this.element && this.element.parentElement) {
            this.element.parentElement.removeChild(this.element);
        }
        if (this.onUnmount) this.onUnmount();
    }

    public onMount?(): void;
    public onUnmount?(): void;
}
