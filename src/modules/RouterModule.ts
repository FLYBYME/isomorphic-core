import { IMeshModule, IMeshApp } from '../interfaces/index';
import { IServiceBroker } from '../interfaces/IServiceBroker';

/**
 * RouterModule — Handles SPA navigation and browser History API interaction.
 */
export class RouterModule implements IMeshModule {
    public readonly name = 'router';
    private app?: IMeshApp;

    onInit(app: IMeshApp): void {
        this.app = app;
    }

    async onReady(): Promise<void> {
        if (typeof window === 'undefined') return;

        console.log('[RouterModule] Initializing History API listeners...');

        window.addEventListener('popstate', () => {
            this.handleRoute(window.location.pathname);
        });
        
        // Handle initial route
        this.handleRoute(window.location.pathname);
    }

    /**
     * Programmatic navigation.
     */
    public navigate(path: string): void {
        if (typeof window === 'undefined') return;

        window.history.pushState({}, '', path);
        this.handleRoute(path);
    }

    private handleRoute(path: string): void {
        console.log(`[RouterModule] Navigating to: ${path}`);
        
        try {
            const broker = this.app?.getProvider<IServiceBroker>('broker');
            if (broker) {
                // Emit navigation event across the local app/mesh
                broker.emit('$router.navigated', { path, timestamp: Date.now() });
            }
        } catch (err) {
            // Broker might not be registered
        }
    }
}
