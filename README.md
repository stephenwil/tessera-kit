# Tessera Kit

Developer tools, CLI, MagicaVoxel pipeline, and project scaffolder for the Tessera High-Res voxel fantasy console.

This repository provides:
- **`@stephenwil/tessera`**: The developer CLI (`dev`, `build`, `test`), live-reload development server, `.vox` importer, and single-file HTML exporter.
- **`@stephenwil/create-tessera`**: Project generator (`npm create @stephenwil/tessera`).

---

## 1. System Architecture & Package Ecosystem

![Architecture and Package Ecosystem](docs/figures/01-architecture-ecosystem.svg)

- **`tessera-high-res`** (Engine): Private repository holding the core 256×256×128 volume, WebGL2 768×432 raymarcher, `wasmoon` Lua runtime, and engine regression tests. Builds the minified core engine.
- **`tessera-kit`** (Tooling): Developer tooling repository publishing private npm packages to GitHub Packages (`@stephenwil/*`).
- **`tessera-hatchase`** (Game Cart): Standalone game repository structured as a Tessera project with `tessera.json`.

---

## 2. Project Manifest & Assembly Pipeline

![Project Manifest & Assembly Pipeline](docs/figures/02-project-assembly.svg)

Each project defines its cart metadata, file ordering, model pivots, and asset sources in `tessera.json`:

```json
{
  "id": "mygame",
  "title": "My Game",
  "author": "Author Name",
  "version": "1.0.0",
  "lua": ["src/player.lua", "src/world.lua", "src/main.lua"],
  "models": {
    "hero": { "file": "models/hero.vox", "pivot": [10, 6, 0] },
    "tree": { "file": "models/tree.vox", "pivot": "center" }
  },
  "palette": "assets/palette.txt",
  "sfx": "assets/sfx.txt"
}
```

The build compiles into:
- **`dist/<id>.tess`**: Canonical plain text cart.
- **`dist/<id>.tess.png`**: Steganographic picture cart with embedded data.
- **`dist/<id>.html`**: Offline standalone single-file runner.

---

## 3. CLI Workflow & State-Preserving Hot Reload

![CLI Workflows: Dev, Test & Build](docs/figures/03-cli-hot-reload.svg)

- **`tessera dev`**: Starts local development server at `http://localhost:3000`. Features **state-preserving hot reload** (retains Lua game state, player position, and camera across script changes; press `R` anytime for a clean restart from `_init()`).
- **`tessera test`**: Headless test runner in Node via `wasmoon` without requiring a browser or GPU. Advances ticks deterministically with `step(N)` and asserts game state.
- **`tessera build`**: Validates syntax, model room boundaries, and palette limits before emitting distributable artifacts.

---

## 4. Voxel Asset Pipeline (`.vox` & Palette Merging)

![Voxel Asset Pipeline](docs/figures/04-voxel-palette-pipeline.svg)

- **MagicaVoxel / Goxel Support**: Parses binary `.vox` files, extracts multi-frame animations from sequential `nSHP` chunks, and converts models to Tessera's room coordinate space.
- **Palette Deduplication**: Collapses duplicate `#RRGGBB` colors across all models.
- **Strict Budgeting**: Checks that total unique colors do not exceed the 255-index limit (index 0 is reserved for transparent air). Fails with detailed per-file counts if overflow occurs.
- **Named Palette Table**: Colors in `assets/palette.txt` are bound to constants accessible in Lua through `C.<name>`.

---

## 5. Developer Scaffolding & Web Distribution

![Developer Scaffolding & Web Distribution](docs/figures/05-scaffolder-distribution.svg)

- **Quickstart**: Create a new cart project with:
  ```sh
  npm create @stephenwil/tessera my-game
  cd my-game
  npm install
  npm run dev
  ```
- **Web Distribution**: Playable via standalone single-file `.html` on itch.io or USB, drag-and-drop `.tess.png` picture carts, or deep-linked into the hosted web console (`play.domain/?cart=...`). Private carts are strictly prevented from ever being bundled into public builds.
