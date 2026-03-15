import { IMeshApp, IMeshModule, ILogger, IServiceBroker } from '../interfaces/index';

/**
 * BootOrchestrator — manages the multi-phase boot sequence of the MeshApp.
 */
export class BootOrchestrator {
    constructor(private app: IMeshApp) { }

    public async executeBootSequence(modules: IMeshModule[]): Promise<void> {
        this.printBootGraph(modules);
        
        const logger = this.app.getProvider<ILogger>('logger');
        let broker: IServiceBroker | undefined;
        try {
            broker = this.app.getProvider<IServiceBroker>('broker');
        } catch (err) {
            // Broker might be registered by one of the modules during onInit
        }

        try {
            // Phase 1: Initialization (Instantiation and configuration)
            for (const mod of modules) {
                this.app.logger.info(`[Orchestrator] Initializing module: ${mod.name}`);
                
                // Inject kernel dependencies
                mod.logger = logger.child ? logger.child({ module: mod.name }) : logger;
                
                // Try to get broker if still missing
                if (!broker) {
                    try { broker = this.app.getProvider<IServiceBroker>('broker'); } catch (e) {}
                }
                
                if (broker) {
                    mod.serviceBroker = broker;
                }

                if (mod.onInit) {
                    await mod.onInit(this.app);
                }

                // If broker was registered during mod.onInit, capture it for subsequent modules
                if (!broker) {
                    try { broker = this.app.getProvider<IServiceBroker>('broker'); } catch (e) {}
                }
            }

            // Phase 2: Binding (Establishing internal connections/dependencies)
            // (Note: We use this phase for complex inter-module wiring)
            // But for now we'll stick to onInit/onStart/onReady

            // Phase 3: Start (Starting operations)
            for (const mod of modules) {
                this.app.logger.info(`[Orchestrator] Starting module: ${mod.name}`);
                if (mod.onStart) {
                    await mod.onStart(this.app);
                }
            }

            // Phase 4: Ready (Final state)
            for (const mod of modules) {
                if (mod.onReady) {
                    await mod.onReady(this.app);
                }
            }
        } catch (error) {
            this.app.logger.error(`[BootOrchestrator] Boot sequence aborted due to error:`, { error });
            throw error;
        }
    }

    private printBootGraph(modules: IMeshModule[]): void {
        console.log('\n--- 🚀 MeshApp Boot Graph ---');
        modules.forEach((mod, i) => {
            const prefix = i === modules.length - 1 ? '└──' : '├──';
            console.log(`${prefix} [${mod.name}]`);
        });
        console.log('-----------------------------\n');
    }

    public async executeTeardown(modules: IMeshModule[]): Promise<void> {
        // Stop in reverse order
        for (const mod of [...modules].reverse()) {
            if (mod.onStop) {
                await mod.onStop(this.app);
            }
        }
    }
}
