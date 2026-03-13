# isomorphic-core

The unified shell and kernel for the isomorphic mesh ecosystem. This package provides the Dependency Injection (DI) shell, the multi-phase boot orchestrator, and the central `ServiceBroker` for routing actions across the mesh.

## Features

- **MeshApp & MeshClientApp**: Standardized shells for backend and frontend environments.
- **ServiceBroker**: The "Kernel" that routes requests locally or remotely with automatic discovery.
- **BootOrchestrator**: Manages a predictable lifecycle sequence (`onInit`, `onBind`, `onReady`).
- **Dependency Injection**: A lightweight provider system for wiring modules and services.
- **Module System**: Easily plug in `isomorphic-mesh`, `isomorphic-auth`, `isomorphic-registry`, and more.

## Installation

```bash
npm install isomorphic-core isomorphic-mesh isomorphic-registry isomorphic-auth
```

## Quick Start

```typescript
import { MeshApp, RegistryModule, NetworkModule, AuthModule } from 'isomorphic-core';

const app = new MeshApp({
    nodeID: 'gateway-1',
    namespace: 'production'
});

// Load modules
app.use(new RegistryModule());
app.use(new NetworkModule({ port: 4000 }));
app.use(new AuthModule());

// Start the app
await app.start();

// The broker is automatically wired and accessible via providers
const broker = app.getProvider('broker');
const result = await broker.call('users.get', { id: '123' });
```

## Architecture

1.  **Shell**: The Motherboard (`MeshApp`). It holds the DI container and knows nothing about the implementation details.
2.  **Modules**: The Organs. Discrete blocks that wrap standalone packages and hook into the lifecycle.
3.  **Broker**: The Kernel (`ServiceBroker`). Connects the shell to the modules and routes all communication.

## License

MIT
