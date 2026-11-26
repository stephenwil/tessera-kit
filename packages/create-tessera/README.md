# @stephenwil/create-tessera

Project scaffolder for the **Tessera High-Res** voxel fantasy console.

## Usage

```sh
# Minimal starter project (works offline)
npm create @stephenwil/tessera@latest my-game
cd my-game
npm install
npm run dev
```

Or start from any playable sample cart on the [Tessera Showcase](https://stephenwil.github.io/tessera-showcase/):

```sh
# List all available showcase templates
npm create @stephenwil/tessera@latest -- --list

# Scaffold an editable project from a showcase cart
npm create @stephenwil/tessera@latest my-arena -- --template bramblecourt
```

Or run directly with `npx`:

```sh
npx @stephenwil/create-tessera@latest my-game
npx @stephenwil/create-tessera@latest my-arena --template bramblecourt
```

## What It Generates

- `tessera.json` — Cart manifest (title, author, quality mode, Lua scripts, models, palette, audio)
- `src/main.lua` — Interactive starter cart (or unpacked Lua source from the chosen showcase template)
- `assets/palette.txt` — Palette overrides (plus `assets/sfx.txt` and `assets/music.txt` when present in a template)
- `models/` — Unpacked voxel models (or your own `.vox` / `.txt` models)
- `.vscode/settings.json` — Lua 5.4 diagnostics preconfigured with Tessera API globals
- `package.json` — Ready-to-run `dev`, `check`, `pack`, and `build` scripts backed by `@stephenwil/tessera`
