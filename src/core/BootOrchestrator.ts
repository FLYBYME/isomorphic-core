import { IMeshApp, IMeshModule } from '../interfaces/index';

/**
 * BootOrchestrator — manages the multi-phase boot sequence of the MeshApp.
 */
export class BootOrchestrator {
    constructor(private app: IMeshApp) { }

    public async executeBootSequence(modules: IMeshModule[]): Promise<void> {
        try {
            // Phase 1: Initialization (Instantiation and configuration)
            for (const mod of modules) {
                if (mod.onInit) {
                    await mod.onInit(this.app);
                }
            }

            // Phase 2: Binding (Establishing internal connections/dependencies)
            for (const mod of modules) {
                if (mod.onBind) {
                    await mod.onBind(this.app);
                }
            }

            // Phase 2.5: Health Checks (Ensuring critical dependencies are up)
            for (const mod of modules) {
                if (mod.health) {
                    const isHealthy = await mod.health();
                    if (!isHealthy) {
                        throw new Error(`[BootOrchestrator] Module ${mod.name} failed health check.`);
                    }
                }
            }

            // Phase 3: Ready (Starting operations)
            for (const mod of modules) {
                if (mod.onReady) {
                    await mod.onReady(this.app);
                }
            }
        } catch (error) {
            console.error(`[BootOrchestrator] Boot sequence aborted due to error:`, error);
            throw error;
        }
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
