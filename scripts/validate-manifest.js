import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const manifest = JSON.parse(read("manifest.json"));

assert.equal(manifest.manifest_version, 1);
assert.ok(manifest.name && manifest.name.length <= 45);
assert.ok(manifest.description && manifest.description.length <= 128);
assert.ok(manifest.action?.title && manifest.action?.popover && manifest.action?.icon);
assert.ok(manifest.background_url);
assert.ok(Array.isArray(manifest.permissions));
assert.ok(manifest.permissions.some(permission => permission.name === "autoplay"));

const required = [
  "index.html",
  "background.html",
  "style.css",
  "icon.svg",
  "src/main.js",
  "src/background.js",
  "src/shot-engine.js",
  "tests/shot-engine.test.js",
];
for (const file of required) {
  assert.ok(existsSync(resolve(root, file)), "arquivo ausente: " + file);
}

const audioPath = resolve(root, "audio/shotgun-20-gauge.mp3");
const audioPresent = existsSync(audioPath);
assert.ok(audioPresent || process.env.REMOTE_AUDIO_BLOB === "1", "arquivo de áudio ausente");
if (audioPresent) {
  assert.ok(readFileSync(audioPath).length > 4000, "arquivo de áudio vazio ou incompleto");
}

const pagesBase = "https://onze1onze.github.io/Ficha-de-Amea-a-";
for (const url of [manifest.icon, manifest.action.icon, manifest.action.popover, manifest.background_url]) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, new URL(pagesBase).origin, "host inesperado: " + url);
  assert.ok(parsed.href.startsWith(pagesBase), "URL fora do GitHub Pages: " + url);
}

const main = read("src/main.js");
const background = read("src/background.js");
const workflow = read(".github/workflows/pages.yml");

assert.ok(main.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(background.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(main.includes("OBR.assets.downloadImages"));
assert.ok(main.includes('"CHARACTER"'));
assert.ok(background.includes("SHOT_SOUND_DELAY_MS"));
assert.ok(background.includes("SHOT_DURATION_MS"));
assert.ok(background.includes("shotgun-20-gauge.mp3"));
assert.ok(background.includes("reconcileSceneShots"));
assert.ok(background.includes("OBR.scene.items.updateItems"));
assert.ok(main.includes("onMessage(EVENT_CHANNEL"));

const uniqueArtifact = "pages-$" + "{{ github.run_id }}-$" + "{{ github.run_attempt }}";
assert.ok(workflow.includes("name: " + uniqueArtifact), "o nome do artefato precisa variar por execução/tentativa");
assert.ok(workflow.includes("artifact_name: " + uniqueArtifact), "deploy-pages precisa consumir o artefato exclusivo da tentativa");

console.log(
  "Manifesto, permissões, arquivos, URLs do Pages, SDK 3.1.0, biblioteca de personagens, recuperação de disparos e artefato de publicação verificados."
);
