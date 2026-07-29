# UI Components

Shared React UI components for the GamePanel ecosystem.

## 📦 Installation

```bash
npm install @gamepanel/ui
```

## 🚀 Usage

### Basic Usage

```tsx
import { Button, Card, Modal, Alert, Badge } from '@gamepanel/ui';
import { ServerStatusBadge, NodeStatusBadge } from '@gamepanel/ui';
import { DataTable, useTable } from '@gamepanel/ui';

function MyComponent() {
  return (
    <Card title="Server Management">
      <Button variant="primary" onClick={() => console.log('Clicked')}>
        Create Server
      </Button>
      
      <ServerStatusBadge status="running" />
      <NodeStatusBadge status="online" />
    </Card>
  );
}
```

## 📁 Available Components

### Layout Components
- `Card` - Container with header, content, and footer
- `Section` - Page section with title and description
- `Page` - Full page layout with header and sidebar
- `Container` - Responsive container
- `Grid` - Responsive grid system

### Form Components
- `Button` - Primary, secondary, and danger buttons
- `Input` - Text input with validation
- `Select` - Dropdown select
- `Checkbox` - Checkbox input
- `Radio` - Radio button group
- `Textarea` - Multi-line text input
- `Form` - Form wrapper with validation
- `FormField` - Individual form field

### Display Components
- `Badge` - Status or count badge
- `Alert` - Alert messages (success, warning, error, info)
- `Modal` - Modal dialog
- `Tooltip` - Tooltip on hover
- `Progress` - Progress bar
- `Spinner` - Loading spinner
- `Avatar` - User or server avatar

### Data Components
- `DataTable` - Advanced data table with sorting, filtering, pagination
- `List` - Generic list component
- `EmptyState` - Empty state placeholder
- `StatsCard` - Statistics display card

### GamePanel-Specific Components
- `ServerStatusBadge` - Server status indicator
- `NodeStatusBadge` - Node status indicator
- `ServerCard` - Server information card
- `NodeCard` - Node information card
- `ConsoleTerminal` - Web-based terminal for server console
- `FileBrowser` - File browser for server files
- `BackupList` - List of server backups
- `AllocationList` - List of port allocations

### Navigation Components
- `Sidebar` - Navigation sidebar
- `Navbar` - Top navigation bar
- `Breadcrumb` - Breadcrumb navigation
- `Pagination` - Pagination controls

## 🎨 Styling

The components use CSS Modules for styling and support theming:

```tsx
import { Button } from '@gamepanel/ui';
import '@gamepanel/ui/dist/styles.css';

// Custom theme
import { ThemeProvider } from '@gamepanel/ui';

<ThemeProvider theme={darkTheme}>
  <App />
</ThemeProvider>
```

## 📦 Package Structure

```
ui/
├── src/
│   ├── components/          # React components
│   │   ├── layout/         # Layout components
│   │   ├── form/           # Form components
│   │   ├── display/        # Display components
│   │   ├── data/           # Data components
│   │   ├── gamepanel/      # GamePanel-specific components
│   │   └── navigation/     # Navigation components
│   ├── hooks/               # Custom React hooks
│   ├── utils/               # Utility functions
│   ├── styles/             # CSS and theme files
│   ├── types/               # TypeScript types
│   └── index.ts             # Main exports
├── dist/                     # Compiled output
├── package.json
└── tsconfig.json
```

## 🎯 Design System

### Colors
```css
--primary: #3b82f6;
--secondary: #6b7280;
--success: #10b981;
--warning: #f59e0b;
--danger: #ef4444;
--info: #06b6d4;
```

### Typography
```css
--font-family: 'Inter', sans-serif;
--font-size-base: 14px;
--font-size-sm: 12px;
--font-size-lg: 16px;
--font-size-xl: 18px;
```

### Spacing
```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
```

## 🔗 Related Packages

- [@gamepanel/sdk](../sdk/) - GamePanel API client
- [@gamepanel/shared-types](../shared-types/) - Shared type definitions
- [@gamepanel/game-templates](../game-templates/) - Game server templates
