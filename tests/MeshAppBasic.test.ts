import { MeshApp } from '../src/core/MeshApp';

describe('MeshApp Basic', () => {
    it('should instantiate', () => {
        const app = new MeshApp({
            nodeID: 'test',
            namespace: 'test'
        });
        expect(app.nodeID).toBe('test');
    });
});
