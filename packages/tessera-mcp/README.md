# @stephenwil/tessera-mcp

Standalone Model Context Protocol (MCP) server for the **Tessera High-Res** voxel fantasy console. Enables AI coding agents (Claude Desktop, Cursor, T3 Code, etc.) to scaffold, study showcase carts, visually render and inspect their own 3D voxel worlds, verify Lua runtime behavior, and package playable cartridges.

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

## Provided Tools (11)

- `tessera_api_docs` — Retrieve accurate Tessera Lua 5.4 API signatures and `.tess` cart/model/music format specs
- `tessera_init_cart` — Scaffold a new Tessera cart project (or start from any showcase `template`)
- `tessera_list_samples` — List all playable sample carts from the live Tessera Showcase catalog
- `tessera_pull_sample` — Download, unpack into a project, or inspect (`inspectOnly: true`) a showcase cart
- `tessera_check_cart` — Validate manifest, Lua block balance, API typos, and optional headless WebGL2 `runtime: true` boot check
- `tessera_render_preview` — Boot the cart in headless WebGL2 Chromium, step frames & optional scripted `keys`, and return a native 768×432 PNG screenshot image for visual agent iteration
- `tessera_assemble_cart` — Assemble `tessera.json` + Lua + models + audio into `.tess`
- `tessera_pack_cart` — Pack into a steganographic 256×256 `.tess.png` picture cart
- `tessera_export_html` — Export a standalone offline single-file `.html` game
- `tessera_inspect_vox` — Inspect MagicaVoxel `.vox` model dimensions and palette
- `tessera_check_palette_budget` — Verify multi-model palette stays within the ≤ 255 color limit

## Provided Prompts (3)

- `create-voxel-game` — Guided end-to-end build, visual critique, polish, and packaging loop
- `remix-showcase-cart` — Pull and remix any playable showcase cart
- `visual-polish-pass` — Capture before/after renders and upgrade lighting, voxel depth, and HUD
