import { MeshApp } from './MeshApp';
import { IMeshApp, IMeshModule, AppConfig } from '../interfaces';

export interface MeshAppOptions extends AppConfig {
    modules?: IMeshModule[];
}

/**
 * createMeshApp — Factory for generating a Mesh kernel.
 * In a hardened Layer 0, modules are injected by the top-level composition.
 */
export function createMeshApp(options: MeshAppOptions): IMeshApp {
    const app = new MeshApp(options);

    // Add injected modules
    if (options.modules) {
        options.modules.forEach(mod => app.use(mod));
    }

    return app;
}
