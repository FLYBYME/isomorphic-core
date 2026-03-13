import { IMeshModule, IMeshApp } from '../interfaces/index';
import { MeshTokenManager, PolicyEngine, TicketManager } from 'isomorphic-auth';

/**
 * AuthModule — Connects the authentication "Organs" to the MeshApp shell.
 */
export class AuthModule implements IMeshModule {
    public readonly name = 'auth';

    onInit(app: IMeshApp): void {
        const logger = (app as any).logger || console;
        
        // 1. Low-level Token Signer
        const tokenManager = new MeshTokenManager(app.nodeID);
        
        // 2. High-level Ticket Lifecycle Manager
        const ticketManager = new TicketManager(
            app.nodeID,
            tokenManager,
            async (action, params) => app.call(action as any, params as any),
            logger,
            app.config['privateKey']
        );

        // 3. Hierarchical Policy Engine
        const policyEngine = new PolicyEngine();

        // Register Providers
        app.registerProvider('auth:token', tokenManager);
        app.registerProvider('auth:ticket', ticketManager);
        app.registerProvider('auth:policy', policyEngine);
    }

    async onReady(app: IMeshApp): Promise<void> {
        const ticketManager = app.getProvider<TicketManager>('auth:ticket');
        // Initial identity bootstrap if private key is present
        if (app.config['privateKey']) {
            await ticketManager.bootstrapIdentity().catch(err => {
                console.warn(`[AuthModule] Failed to bootstrap identity: ${err.message}`);
            });
        }
    }

    async onStop(app: IMeshApp): Promise<void> {
        const ticketManager = app.getProvider<TicketManager>('auth:ticket');
        ticketManager.stop();
    }
}
