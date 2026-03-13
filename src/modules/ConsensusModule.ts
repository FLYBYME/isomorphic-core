import { IMeshModule, IMeshApp } from '../interfaces/index';
import { RaftNode } from 'raft-consensus';

export class ConsensusModule implements IMeshModule {
    public readonly name = 'consensus';
    private raftNode!: RaftNode;

    onInit(app: IMeshApp): void {
        const network: any = app.getProvider('network'); // Needs bridge
        const storage: any = app.getProvider('storage'); // Needs adapter
        const logger = (app as any).logger || console;

        this.raftNode = new RaftNode(network, storage, logger, {
            electionTimeoutMin: 150,
            electionTimeoutMax: 300,
            heartbeatInterval: 50,
            minClusterSize: 3
        });

        app.registerProvider('consensus', this.raftNode);
    }

    async onReady(app: IMeshApp): Promise<void> {
        await this.raftNode.start();
    }

    async onStop(app: IMeshApp): Promise<void> {
        await this.raftNode.stop();
    }
}
