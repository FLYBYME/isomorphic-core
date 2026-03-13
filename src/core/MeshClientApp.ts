import { MeshApp } from './MeshApp';
import { AppConfig } from '../interfaces/index';

/**
 * MeshClientApp — Specialized shell for frontend/browser environments.
 * It might pre-configure browser-specific modules like WSTransport or DOM UI.
 */
export class MeshClientApp extends MeshApp {
    constructor(config: AppConfig) {
        super(config);
        // Pre-configure client-specific logic if needed
    }
}
