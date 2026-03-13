import { IMeshModule, IMeshApp } from '../interfaces/index';
import { RaftNode } from 'raft-consensus';
import { MeshNetwork } from 'isomorphic-mesh';
import { IStorageAdapter } from 'raft-consensus';

/**
 * ConsensusModule — Connects the distributed Raft consensus engine to the MeshApp.
 */
export class ConsensusModule implements IMeshModule {
    public readonly name = 'consensus';
    private raftNode!: RaftNode;

    onInit(app: IMeshApp): void {
        const network = app.getProvider<MeshNetwork>('network');
        const storage = app.getProvider<IStorageAdapter>('storage');
        const logger = (app as any).logger || console;

        // Configuration from app config
        const raftConfig = app.config['raft'] || {
            electionTimeoutMin: 150,
            electionTimeoutMax: 300,
            heartbeatInterval: 50,
            minClusterSize: 3
        };

        this.raftNode = new RaftNode(network as any, storage, logger, raftConfig);

        // Bind the Raft state machine's applyCommitted to emit a mesh-wide event
        this.raftNode.on('commit', ({ entry }) => {
            try {
                const broker = app.getProvider<any>('broker');
                broker.emit('$state.mutated', {
                    namespace: entry.namespace,
                    index: entry.index,
                    term: entry.term,
                    payload: entry.payload
                });
            } catch (err) {
                // Broker might not be ready
            }
        });

        app.registerProvider('consensus', this.raftNode);
    }

    async onReady(app: IMeshApp): Promise<void> {
        await this.raftNode.start();
    }

    async onStop(app: IMeshApp): Promise<void> {
        // Fix: Ensure timers are cleared during teardown
        await this.raftNode.stop();
    }
}
