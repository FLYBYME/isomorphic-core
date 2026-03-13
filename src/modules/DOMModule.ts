import { IMeshModule, IMeshApp } from '../interfaces/index';
import { BrokerComponent } from '../client/BrokerComponent';
import { ReactiveState } from '../client/ReactiveState';

/**
 * DOMModule — Mounts the Virtual DOM to the browser's document.
 */
export class DOMModule implements IMeshModule {
    public readonly name = 'dom';
    private app?: IMeshApp;
    private rootElement: HTMLElement | null = null;
    private options: { rootID?: string } = {};

    constructor(options: { rootID?: string } = {}) {
        this.options = options;
    }

    onInit(app: IMeshApp): void {
        this.app = app;
        
        // Auto-configure BrokerComponent with the state tree if present
        try {
            const state = app.getProvider<ReactiveState<any>>('state');
            BrokerComponent.setGlobalState(state);
        } catch (err) {
            // State module might not be used
        }
    }

    async onBind(): Promise<void> {
        if (typeof document === 'undefined') return;

        const rootID = this.options.rootID || (this.app?.config['rootID'] as string) || 'app';
        this.rootElement = document.getElementById(rootID);

        if (!this.rootElement) {
            console.warn(`[DOMModule] Root element #${rootID} not found. Creating it...`);
            this.rootElement = document.createElement('div');
            this.rootElement.id = rootID;
            document.body.appendChild(this.rootElement);
        }
    }

    /**
     * Renders the root component.
     */
    public render(component: BrokerComponent): void {
        if (!this.rootElement) {
            throw new Error('[DOMModule] Cannot render: root element not found.');
        }
        
        // Use the component's internal reconciliation rather than innerHTML = ''
        component.mount(this.rootElement);
    }
}
