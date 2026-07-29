# Game Templates

Pre-configured game server templates for easy deployment in GamePanel.

## 📁 Structure

- `src/` - Source TypeScript code for template management
- `dist/` - Compiled output
- `templates/` - Game template definitions
- `scripts/` - Build and utility scripts
- `index.json` - Index of all available templates
- `template-schema.json` - JSON schema for template validation

## 🎮 Supported Games

This package includes templates for popular game servers. See `index.json` for the complete list of supported games and their configurations.

## 🚀 Usage

### Adding a New Template

1. Create a new template file in `templates/`
2. Add the template metadata to `index.json`
3. Validate against `template-schema.json`

### Template Schema

Each template must conform to the schema defined in `template-schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "description": {"type": "string"},
    "dockerImage": {"type": "string"},
    "ports": {"type": "array", "items": {"type": "number"}},
    "environment": {"type": "object"},
    "volumes": {"type": "array"},
    "startup": {"type": "string"}
  },
  "required": ["name", "dockerImage"]
}
```

## 📦 Installation

```bash
npm install @gamepanel/game-templates
```
