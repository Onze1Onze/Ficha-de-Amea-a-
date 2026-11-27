import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));

assert.equal(manifest.manifest_version, 1);
assert.equal(manifest.version, pkg.version);
assert.ok(manifest.name && manifest.name.length <= 45);
assert.ok(manifest.description && manifest.description.length <= 128);
assert.ok(manifest.action?.title && manifest.action?.icon && manifest.action?.popover);
assert.ok(manifest.background_url);

for (const path of ["index.html", "background.html", "style.css", "icon.svg", "src/main.js", "src/background.js", "src/engine.js", "tests/engine.test.js"]) {
  assert.ok(existsSync(resolve(root, path)), `arquivo obrigatório ausente: ${path}`);
}

const main = read("src/main.js");
const background = read("src/background.js");
const engine = read("src/engine.js");
const html = read("index.html");
assert.ok(main.includes("OBR.assets.downloadImages"));
assert.ok(main.includes("OBR.player.getSelection"));
assert.ok(main.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(background.includes("OBR.scene.items.updateItems"));
assert.ok(background.includes("OBR.broadcast.onMessage"));
assert.ok(engine.includes("TRANSITION_DURATION_MS = 4000"));
assert.ok(engine.includes("item.metadata?.[TRANSITION_KEY]"));
assert.ok(html.includes("available-actions"));
assert.ok(html.includes("attack-state"));
console.log("Manifesto, arquivos, SDK, ações e cronômetro de 4000 ms verificados.");
