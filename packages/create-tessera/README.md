# @stephenwil/create-tessera

Project scaffolder for the **Tessera High-Res** voxel fantasy console.

## Usage

```sh
npm create @stephenwil/tessera@latest my-game
cd my-game
npm install
npm run dev
```

Or run directly with `npx`:

```sh
npx @stephenwil/create-tessera@latest my-game
```

## What It Generates

- `tessera.json` — Cart manifest (title, author, Lua script order, `.vox` models, palette)
- `src/main.lua` — Interactive starter cart using `camera()`, `mbox()`, `sphere()`, `btn()`, and HUD `print()`
- `assets/palette.txt` — Starter 15-color palette
- `.vscode/settings.json` — Lua 5.4 diagnostics preconfigured with Tessera API globals
- `package.json` — Ready-to-run `dev`, `check`, `pack`, and `build` scripts backed by `@stephenwil/tessera`
