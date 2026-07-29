# GamePanel SDK

TypeScript SDK for interacting with the GamePanel API.

## 📦 Installation

```bash
npm install @gamepanel/sdk
```

## 🚀 Usage

### Basic Usage

```typescript
import { GamePanelClient } from '@gamepanel/sdk';

// Initialize the client
const client = new GamePanelClient({
  baseUrl: 'https://panel.yourdomain.com',
  apiKey: 'your-api-key-here'
});

// List all servers
const servers = await client.servers.list();
console.log(servers);

// Get server details
const server = await client.servers.get('server-uuid-here');
console.log(server);
```

### Authentication

```typescript
// Using API key
await client.authenticateWithApiKey('your-api-key');

// Using username/password
await client.authenticateWithCredentials('username', 'password');
```

### Server Management

```typescript
// Create a server
const newServer = await client.servers.create({
  name: 'My Game Server',
  eggId: 1,
  dockerImage: 'ghcr.io/gamepanel/minecraft:latest',
  environment: {
    MEMORY: '2048',
    CPU: '100'
  },
  limits: {
    memory: 2048,
    cpu: 100,
    disk: 10240
  },
  featureLimits: {
    databases: 1,
    backups: 5
  }
});

// Start a server
await client.servers.start('server-uuid');

// Stop a server
await client.servers.stop('server-uuid');

// Delete a server
await client.servers.delete('server-uuid');
```

### Advanced Features

```typescript
// WebSocket console connection
const consoleSocket = client.servers.console('server-uuid');
consoleSocket.on('message', (data) => {
  console.log(data);
});
consoleSocket.send('command here');

// File management
const files = await client.servers.listFiles('server-uuid', '/');
await client.servers.uploadFile('server-uuid', '/path/to/file', fileContent);
await client.servers.downloadFile('server-uuid', '/path/to/file');

// Backups
const backups = await client.backups.list('server-uuid');
await client.backups.create('server-uuid', {name: 'Pre-update backup'});
await client.backups.restore('server-uuid', 'backup-uuid');
```

## 📚 API Reference

See the full API documentation in the [GamePanel API Docs](../../docs/api/).

## 🔧 Configuration

### Client Options

```typescript
interface GamePanelClientOptions {
  baseUrl: string;           // Base URL of the GamePanel instance
  apiKey?: string;          // API key for authentication
  timeout?: number;         // Request timeout in milliseconds (default: 30000)
  retries?: number;         // Number of retries for failed requests (default: 3)
  debug?: boolean;          // Enable debug logging (default: false)
}
```

## 🐛 Error Handling

```typescript
try {
  const server = await client.servers.get('invalid-uuid');
} catch (error) {
  if (error instanceof GamePanelError) {
    console.error(`Error ${error.code}: ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

## 📝 License

MIT License - See [LICENSE](../../LICENSE) for details.
