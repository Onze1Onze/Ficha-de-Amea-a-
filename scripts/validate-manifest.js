import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 1);
assert.ok(manifest.name && manifest.name.length <= 45);
assert.ok(manifest.description && manifest.description.length <= 128);
assert.ok(manifest.action?.title && manifest.action?.popover && manifest.action?.icon);
assert.ok(manifest.background_url);

const required = [
  "index.html", "background.html", "style.css", "icon.svg",
  "src/main.js", "src/background.js", "src/shot-engine.js",
];
for (const file of required) assert.ok(existsSync(resolve(root, file)), `arquivo ausente: ${file}`);

const audioPath = resolve(root, "audio/shotgun-20-gauge.mp3");
const audioPresent = existsSync(audioPath);
assert.ok(audioPresent || process.env.REMOTE_AUDIO_BLOB === "1", "arquivo de áudio ausente");

const pagesBase = "https://onze1onze.github.io/Ficha-de-Amea-a-";
for (const url of [manifest.icon, manifest.action.icon, manifest.action.popover, manifest.background_url]) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, new URL(pagesBase).origin, `host inesperado: ${url}`);
  assert.ok(parsed.href.startsWith(pagesBase), `URL fora do GitHub Pages: ${url}`);
}
const main = readFileSync(resolve(root, "src/main.js"), "utf8");
const background = readFileSync(resolve(root, "src/background.js"), "utf8");
assert.ok(main.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(background.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(background.includes("SHOT_DURATION_MS"));
assert.ok(background.includes("shotgun-20-gauge.mp3"));
assert.ok(main.includes("onMessage(EVENT_CHANNEL"));

console.log(`Manifesto válido; ${required.length + 1} referências obrigatórias configuradas; SDK fixado em 3.1.0; áudio ${audioPresent ? "local presente" : "validado separadamente no GitHub"}.`);
