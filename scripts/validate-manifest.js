import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMp3Buffer } from "./audio-validation.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const packageJson = JSON.parse(read("package.json"));
assert.equal(manifest.manifest_version, 1);
assert.equal(manifest.version, "1.0.1");
assert.equal(packageJson.version, manifest.version, "package.json e manifest.json precisam compartilhar a versão");
assert.ok(manifest.name && manifest.name.length <= 45);
assert.ok(manifest.description && manifest.description.length <= 128);
assert.ok(manifest.action?.title && manifest.action?.popover && manifest.action?.icon);
assert.ok(manifest.background_url);
assert.ok(Array.isArray(manifest.permissions));
assert.ok(manifest.permissions.some(permission => permission.name === "autoplay"));

const required = ["index.html","background.html","style.css","icon.svg","src/main.js","src/background.js","src/audio-player.js","src/shot-engine.js","tests/shot-engine.test.js","tests/audio-player.test.js","scripts/prepare-audio.js","scripts/audio-validation.js"];
for (const file of required) assert.ok(existsSync(resolve(root, file)), "arquivo ausente: " + file);

const shotAudioPath = resolve(root, "audio/shotgun-20-gauge.mp3");
assert.ok(existsSync(shotAudioPath), "efeito sonoro do disparo ausente");
assert.ok(readFileSync(shotAudioPath).length > 4000, "efeito sonoro do disparo vazio ou incompleto");
const casingAudioPath = resolve(root, "audio/bullet-casing-metal.mp3");
assert.ok(existsSync(casingAudioPath), "efeito metálico do estojo ausente; execute npm run prepare:audio");
validateMp3Buffer(readFileSync(casingAudioPath));

const pagesBase = "https://onze1onze.github.io/Ficha-de-Amea-a-";
for (const url of [manifest.icon, manifest.action.icon, manifest.action.popover, manifest.background_url]) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, new URL(pagesBase).origin, "host inesperado: " + url);
  assert.ok(parsed.href.startsWith(pagesBase), "URL fora do GitHub Pages: " + url);
}

const main = read("src/main.js");
const background = read("src/background.js");
const audioPlayer = read("src/audio-player.js");
const workflowContent = read(".github/workflows/pages.yml");
const shotEngine = read("src/shot-engine.js");
assert.ok(main.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(background.includes("@owlbear-rodeo/sdk@3.1.0"));
assert.ok(main.includes("OBR.assets.downloadImages"));
assert.ok(main.includes('"CHARACTER"'));
assert.ok(background.includes("SHOT_SOUND_DELAY_MS"));
assert.ok(background.includes("SHOT_DURATION_MS"));
assert.ok(background.includes("shotgun-20-gauge.mp3"));
assert.ok(background.includes("bullet-casing-metal.mp3"));
assert.ok(!background.includes("sfxmint.com/dl/"), "o runtime não deve depender de hotlink externo");
assert.ok(background.includes("createAudioPlayer(SHOT_AUDIO_URL)"));
assert.ok(background.includes("createAudioPlayer(CASING_AUDIO_URL)"));
assert.ok(background.includes("playPreparedAudio(audioPlayer, volume)"));
assert.ok(audioPlayer.includes("audio.load()"));
assert.ok(background.includes("scheduleCasingSound"));
assert.ok(background.includes("reconcileSceneShots"));
assert.ok(background.includes("OBR.scene.items.updateItems"));
assert.ok(main.includes("onMessage(EVENT_CHANNEL"));
assert.ok(shotEngine.includes("CASING_SOUND_DELAY_MS = 450"));
const prepareIndex = workflowContent.indexOf("npm run prepare:audio");
const checkIndex = workflowContent.indexOf("npm run check");
assert.ok(prepareIndex >= 0 && prepareIndex < checkIndex, "o áudio precisa ser preparado antes das verificações");
const uniqueArtifact = "pages-$" + "{{ github.run_id }}-$" + "{{ github.run_attempt }}";
assert.ok(workflowContent.includes("name: " + uniqueArtifact), "o nome do artefato precisa variar por execução/tentativa");
assert.ok(workflowContent.includes("artifact_name: " + uniqueArtifact), "deploy-pages precisa consumir o artefato exclusivo da tentativa");
console.log("Manifesto 1.0.1, versões, permissões, URLs, SDK, MP3s, pré-carregamento, reprodução local, recuperação e publicação verificados.");
