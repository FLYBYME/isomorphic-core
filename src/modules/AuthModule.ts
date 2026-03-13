import { IMeshModule, IMeshApp } from '../interfaces/index';
import { MeshTokenManager, PolicyEngine } from 'isomorphic-auth';

export class AuthModule implements IMeshModule {
    public readonly name = 'auth';

    onInit(app: IMeshApp): void {
        const tokenManager = new MeshTokenManager(app.nodeID);
        const policyEngine = new PolicyEngine();

        app.registerProvider('auth:token', tokenManager);
        app.registerProvider('auth:policy', policyEngine);
    }
}
