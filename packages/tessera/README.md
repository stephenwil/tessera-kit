# @stephenwil/tessera

Developer CLI, live-reload dev server, `.vox` importer, `.tess.png` picture-cart packer, offline HTML exporter, showcase sample puller, and built-in MCP server for the **Tessera High-Res** voxel fantasy console (`256×256×128` voxels, `768×432` WebGL2 raymarcher, Lua 5.4).

## Quick Start

```sh
# Scaffold a new project (offline minimal starter)
npm create @stephenwil/tessera@latest my-game
cd my-game
npm install

# Or start from any playable showcase sample
npm create @stephenwil/tessera@latest my-arena -- --template bramblecourt

# Run local dev server with live reload (http://localhost:3000)
npm run dev
```

## CLI Commands

```sh
npx @stephenwil/tessera@latest init my-game [--template <id>]  # Scaffold a new cart project
npx @stephenwil/tessera@latest samples                         # List showcase sample carts
npx @stephenwil/tessera@latest pull <id> [--project [dir]]     # Download .tess, --png, or unpack project
npx @stephenwil/tessera@latest dev [path]                      # Live-reload dev server (--port, --host)
npx @stephenwil/tessera@latest check [path]                    # Validate cart syntax & manifest
npx @stephenwil/tessera@latest pack [path]                     # Build .tess & steganographic .tess.png
npx @stephenwil/tessera@latest unpack <cart.tess.png>          # Unpack picture cart to plain text
npx @stephenwil/tessera@latest vox <files...>                  # Convert MagicaVoxel .vox models
npx @stephenwil/tessera@latest export [path]                   # Export self-contained offline .html
npx @stephenwil/tessera@latest mcp                             # Start stdio MCP server for AI agents
```

Inside a project directory with `tessera.json`, `check`, `pack`, `export`, and `dev` all work with zero arguments and emit into `dist/`.

## Using with AI Agents (MCP)

Add to your MCP client configuration (Claude Desktop, Cursor, T3 Code, etc.):

```json
{
  "mcpServers": {
    "tessera": {
      "command": "npx",
      "args": ["-y", "@stephenwil/tessera@latest", "mcp"]
    }
  }
}
```

Exposes 8 tools: `tessera_init_cart`, `tessera_check_cart`, `tessera_assemble_cart`, `tessera_pack_cart`, `tessera_export_html`, `tessera_inspect_vox`, `tessera_check_palette_budget`, and `tessera_api_docs`.

## Sample Carts

The bundled runner includes only the minimal `hello` cart to keep exported HTML games lean. Browse and pull full sample carts from the **[Tessera Cartridge Showcase](https://stephenwil.github.io/tessera-showcase/)**:

```sh
npx @stephenwil/tessera@latest samples
npx @stephenwil/tessera@latest pull bramblecourt --project my-arena
```
