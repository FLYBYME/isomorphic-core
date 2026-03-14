import { IMeshModule, IMeshApp, IServiceBroker } from '../interfaces/index';
import { IRaftNode, INetworkAdapter, RaftMessage, IStorageAdapter, LogEntry } from 'raft-consensus';
import { RaftNode } from 'raft-consensus'; 
import { MeshNetwork, MeshPacket } from 'isomorphic-mesh';


/**
 * RaftNetworkAdapter — Bridges the MeshNetwork to the Raft INetworkAdapter interface.
 */
class RaftNetworkAdapter implements INetworkAdapter {
    constructor(private network: MeshNetwork) { }

    async send(targetNodeID: string, message: RaftMessage): Promise<void> {
        return this.network.send(targetNodeID, message.topic, message.data as Record<string, unknown>);
    }

    async broadcast(message: RaftMessage): Promise<void> {
        return this.network.publish(message.topic, message.data as Record<string, unknown>);
    }

    on(topic: string, handler: (message: RaftMessage) => void): void {
        this.network.onMessage(topic, (data: any, packet: MeshPacket) => {
            handler({
                topic,
                data: data as Record<string, unknown>,
                senderNodeID: packet.senderNodeID!,
                meta: packet.meta
            });
        });
    }

    getNodeID(): string {
        return this.network.nodeId;
    }
}

/**
 * ConsensusModule — Connects the distributed Raft consensus engine to the MeshApp.
 */
export class ConsensusModule implements IMeshModule {
    public readonly name = 'consensus';
    private raftNode!: IRaftNode;

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

        const adapter = new RaftNetworkAdapter(network);
        this.raftNode = (new RaftNode(adapter, storage, logger, raftConfig) as unknown) as IRaftNode;

        // Bind the Raft state machine's applyCommitted to emit a mesh-wide event
        this.raftNode.on('commit', (data: any) => {
            const { entry } = data as { entry: LogEntry };
            try {
                const broker = app.getProvider<IServiceBroker>('broker');
                broker.emit('$state.mutated', {
                    namespace: entry.namespace,
                    index: entry.index,
                    term: entry.term,
                    payload: entry.payload
                } as any); // payload can be any
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
