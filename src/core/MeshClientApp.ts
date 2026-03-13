import { MeshApp } from './MeshApp';
import { AppConfig } from '../interfaces/index';

/**
 * MeshClientApp — Specialized shell for frontend/browser environments.
 */
export class MeshClientApp extends MeshApp {
    constructor(config: AppConfig) {
        super(config);
    }
}
