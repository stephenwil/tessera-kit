# @stephenwil/tessera

Developer CLI, live-reload dev server, `.vox` importer, `.tess.png` picture-cart packer, offline HTML exporter, and built-in MCP server for the **Tessera High-Res** voxel fantasy console (`256×256×128` voxels, `768×432` WebGL2 raymarcher, Lua 5.4).

## Quick Start

```sh
# Scaffold a new project
npm create @stephenwil/tessera my-game
cd my-game
npm install

# Run local dev server with live reload (http://localhost:3000)
npm run dev
```

## CLI Commands

```sh
npx @stephenwil/tessera init my-game          # Scaffold a new cart project
npx @stephenwil/tessera dev [path]            # Live-reload dev server (--port, --host)
npx @stephenwil/tessera check [path]          # Validate cart syntax & manifest
npx @stephenwil/tessera pack [path]           # Build .tess & steganographic .tess.png
npx @stephenwil/tessera unpack <cart.tess.png># Unpack picture cart to plain text
npx @stephenwil/tessera vox <files...>        # Convert MagicaVoxel .vox models
npx @stephenwil/tessera export [path]         # Export self-contained offline .html
npx @stephenwil/tessera mcp                   # Start stdio MCP server for AI agents
```

Inside a project directory with `tessera.json`, `check`, `pack`, `export`, and `dev` all work with zero arguments and emit into `dist/`.

## Using with AI Agents (MCP)

Add to your MCP client configuration (Claude Desktop, Cursor, T3 Code, etc.):

```json
{
  "mcpServers": {
    "tessera": {
      "command": "npx",
      "args": ["-y", "@stephenwil/tessera", "mcp"]
    }
  }
}
```

Exposes 8 tools: `tessera_init_cart`, `tessera_check_cart`, `tessera_assemble_cart`, `tessera_pack_cart`, `tessera_export_html`, `tessera_inspect_vox`, `tessera_check_palette_budget`, and `tessera_api_docs`.

## Demo Carts

The bundled runner includes only the minimal `hello` cart to keep exported HTML games lean. Play and download full demo carts (`.tess` and `.tess.png`) from the **[Tessera Cartridge Showcase](https://stephenwil.github.io/tessera-showcase/)**, then run them locally with `npx @stephenwil/tessera dev <cart.tess>`.
