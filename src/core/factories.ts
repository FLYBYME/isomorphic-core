import { MeshApp } from './MeshApp';
import { AppConfig } from '../interfaces/IMeshApp';
import { LoggerModule, LogLevel } from '../modules/LoggerModule';
import { BrokerModule } from '../modules/BrokerModule';
import { NetworkModule } from '../modules/NetworkModule';
import { RegistryModule } from '../modules/RegistryModule';
import { AuthModule } from '../modules/AuthModule';
import { StateModule } from '../modules/StateModule';
import { DOMModule } from '../modules/DOMModule';
import { RouterModule } from '../modules/RouterModule';

export interface MeshAppOptions extends AppConfig {
    logLevel?: LogLevel;
    rootID?: string;
    modules?: any[];
}

/**
 * createMeshApp — The "Everything" Factory.
 * Pre-bundles the core modules so developers can start in 10 seconds.
 */
export function createMeshApp(options: MeshAppOptions) {
    const app = new MeshApp(options);

    // Standard Core Bundle
    app.use(new LoggerModule(options.logLevel || LogLevel.INFO));
    app.use(new RegistryModule());
    app.use(new BrokerModule());
    app.use(new NetworkModule());
    app.use(new AuthModule());
    app.use(new StateModule());
    
    if (typeof document !== 'undefined') {
        app.use(new DOMModule({ rootID: options.rootID }));
        app.use(new RouterModule());
    }

    // Add user modules
    if (options.modules) {
        options.modules.forEach(mod => app.use(mod));
    }

    return app;
}
