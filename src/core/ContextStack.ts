import { IContext } from '../interfaces';

/**
 * Isomorphic Context Tracking.
 * Uses AsyncLocalStorage in Node.js and a simple stack in the Browser.
 */
export class ContextStack {
    private static storage: import('node:async_hooks').AsyncLocalStorage<IContext> | undefined;
    private static browserStack: IContext[] = [];

    static {
        try {
            // @ts-ignore
            const { AsyncLocalStorage } = require('node:async_hooks');
            if (AsyncLocalStorage) {
                this.storage = new AsyncLocalStorage();
            }
        } catch (e) {
            // Browser environment
        }
    }

    /**
     * Executes a function within a context.
     */
    public static run<T>(ctx: IContext, fn: () => T): T {
        if (this.storage) {
            return this.storage.run(ctx, fn);
        }
        
        // Browser Fallback: Manual stack management
        this.browserStack.push(ctx);
        try {
            return fn();
        } finally {
            this.browserStack.pop();
        }
    }

    /**
     * Retrieves the current context.
     */
    public static getContext(): IContext | undefined {
        if (this.storage) {
            return this.storage.getStore();
        }
        return this.browserStack[this.browserStack.length - 1];
    }
}
