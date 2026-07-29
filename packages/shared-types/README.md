# Shared Types

Shared TypeScript type definitions for the GamePanel ecosystem.

## 📦 Installation

```bash
npm install @gamepanel/shared-types
```

## 🚀 Usage

Import types directly in your TypeScript projects:

```typescript
import type {
  Server,
  ServerStatus,
  GameTemplate,
  User,
  Node,
  Allocation,
  Backup,
  Database,
  Egg,
  Nest,
  Location
} from '@gamepanel/shared-types';

// Use the types in your code
interface MyComponentProps {
  server: Server;
  status: ServerStatus;
}
```

## 📁 Available Types

### Core Types
- `Server` - Game server instance
- `Node` - Physical or virtual machine hosting servers
- `User` - User account
- `Location` - Geographic location for nodes

### Game Server Types
- `GameTemplate` - Game server template definition
- `Egg` - Game server configuration preset
- `Nest` - Collection of eggs
- `Allocation` - Port allocation for servers
- `Backup` - Server backup
- `Database` - Game server database

### Status Types
- `ServerStatus` - Current state of a server
- `NodeStatus` - Current state of a node
- `BackupStatus` - Current state of a backup

### Configuration Types
- `ServerConfiguration` - Server-specific configuration
- `NodeConfiguration` - Node-specific configuration
- `StartupCommand` - Server startup command
- `EnvironmentVariables` - Environment variable mapping

### API Types
- `Pagination` - Pagination metadata
- `ApiResponse<T>` - Standard API response wrapper
- `ErrorResponse` - Standard error response

## 🔧 Type Definitions

### Server Type Example

```typescript
interface Server {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  status: ServerStatus;
  nodeId: number;
  nestId: number;
  eggId: number;
  dockerImage: string;
  startup: string;
  environment: EnvironmentVariables;
  limits: ServerLimits;
  featureLimits: FeatureLimits;
  allocations: Allocation[];
  createdAt: Date;
  updatedAt: Date;
}
```

### ServerStatus Enum

```typescript
type ServerStatus = 
  | 'installing'
  | 'installed'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'restarting'
  | 'reinstalling'
  | 'suspended'
  | 'restoring'
  | 'migrating'
  | 'offline'
  | 'crashed';
```

## 📦 Package Structure

```
shared-types/
├── src/
│   ├── index.ts              # Main type exports
│   ├── servers.ts            # Server-related types
│   ├── nodes.ts              # Node-related types
│   ├── users.ts              # User-related types
│   ├── games.ts              # Game-related types
│   ├── backups.ts            # Backup-related types
│   ├── databases.ts          # Database-related types
│   ├── allocations.ts        # Allocation-related types
│   ├── api.ts                # API response types
│   └── enums.ts              # TypeScript enums
├── dist/                     # Compiled output
├── package.json
└── tsconfig.json
```

## 🔗 Related Packages

- [@gamepanel/sdk](../sdk/) - GamePanel API client
- [@gamepanel/ui](../ui/) - Shared UI components
- [@gamepanel/game-templates](../game-templates/) - Game server templates
