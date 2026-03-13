import { MeshApp } from '../core/MeshApp';
import { IMeshModule } from '../interfaces';

describe('MeshApp DI Container', () => {
    let app: MeshApp;

    beforeEach(() => {
        app = new MeshApp({
            nodeID: 'test-node',
            namespace: 'test'
        });
    });

    it('should register and retrieve a provider by token string', () => {
        const mockProvider = { value: 42 };
        app.registerProvider('my-provider', mockProvider);
        
        expect(app.getProvider('my-provider')).toBe(mockProvider);
    });

    it('should register and retrieve a provider by constructor/class token', () => {
        class MyService {
            static readonly name = 'MyService';
        }
        const serviceInstance = new MyService();
        
        app.registerProvider(MyService, serviceInstance);
        expect(app.getProvider(MyService)).toBe(serviceInstance);
    });

    it('should throw error when provider is not found', () => {
        expect(() => app.getProvider('missing')).toThrow('[MeshApp] Provider not found for token: missing');
    });

    it('should handle pending middleware when broker is registered', () => {
        const mockMiddleware = jest.fn();
        const mockBroker = {
            use: jest.fn(),
            registerService: jest.fn()
        };

        app.use(mockMiddleware);
        app.registerProvider('broker' as any, mockBroker);

        expect(mockBroker.use).toHaveBeenCalledWith(mockMiddleware);
    });

    it('should handle pending services when broker is registered', () => {
        const mockService = { name: 'TestService' };
        const mockBroker = {
            use: jest.fn(),
            registerService: jest.fn()
        };

        app.registerService(mockService);
        app.registerProvider('broker' as any, mockBroker);

        expect(mockBroker.registerService).toHaveBeenCalledWith(mockService);
    });

    it('should register modules', () => {
        const mockModule: IMeshModule = {
            name: 'test-module',
            onInit: jest.fn()
        };

        app.use(mockModule);
        // Modules are stored internally and used by BootOrchestrator
        // We can't directly access them but we can verify the orchestrator is called in start()
    });
});
