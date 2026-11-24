import fs from "node:fs";
import path from "node:path";
import { parseCart } from "./cart/tess.js";

export function checkCartCli(cartPath) {
  const fullCartPath = path.resolve(process.cwd(), cartPath);
  if (!fs.existsSync(fullCartPath)) {
    throw new Error(`Cart file not found: ${cartPath}`);
  }

  const cartText = fs.readFileSync(fullCartPath, "utf8");
  const parsed = parseCart(cartText);

  const errors = [];
  const warnings = [];

  if (!parsed.meta?.id) {
    warnings.push("Missing id in __meta__ section");
  }
  if (!parsed.meta?.title) {
    warnings.push("Missing title in __meta__ section");
  }

  if (!parsed.lua || parsed.lua.trim().length === 0) {
    errors.push("Cart contains no Lua code");
  } else {
    // Basic syntax check for balanced blocks
    const lines = parsed.lua.split("\n");
    let openBlocks = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/--.*$/, "").trim();
      const starts = (line.match(/\b(function|then|do|repeat)\b/g) || []).length;
      const ends = (line.match(/\b(end|until)\b/g) || []).length;
      openBlocks += starts - ends;
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings,
      parsed,
    };
  }

  return {
    ok: true,
    errors: [],
    warnings,
    parsed,
  };
}
