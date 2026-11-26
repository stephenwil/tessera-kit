# @stephenwil/tessera-mcp

Standalone Model Context Protocol (MCP) server for the **Tessera High-Res** voxel fantasy console. Enables AI coding agents (Claude Desktop, Cursor, T3 Code, etc.) to scaffold, inspect, validate, pack, and export 3D voxel games.

## Configuration

Add to your MCP client configuration (`claude_desktop_config.json`, Cursor MCP settings, or T3 Code):

```json
{
  "mcpServers": {
    "tessera": {
      "command": "npx",
      "args": ["-y", "@stephenwil/tessera-mcp@latest"]
    }
  }
}
```

## Provided Tools

- `tessera_init_cart` — Scaffold a new Tessera cart project
- `tessera_check_cart` — Validate cart structure, manifest, and Lua block balance
- `tessera_assemble_cart` — Assemble `tessera.json` + Lua + `.vox` models into `.tess`
- `tessera_pack_cart` — Pack into a steganographic 256×256 `.tess.png` picture cart
- `tessera_export_html` — Export a standalone offline single-file `.html` game
- `tessera_inspect_vox` — Inspect MagicaVoxel `.vox` model dimensions and palette
- `tessera_check_palette_budget` — Verify multi-model palette stays within the ≤ 255 color limit
- `tessera_api_docs` — Retrieve accurate Tessera Lua 5.4 API signatures into context
