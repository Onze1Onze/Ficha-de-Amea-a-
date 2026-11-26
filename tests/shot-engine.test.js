import test from "node:test";
import assert from "node:assert/strict";
import {
  SHOT_SOUND_DELAY_MS, SHOT_DURATION_MS, SHOT_AFTER_SOUND_MS,
  canRestoreShot, canStartShot, compareClaims, hasShotMarker,
} from "../src/shot-engine.js";

const image = (id, layer = "CHARACTER", url = "https://assets.test/" + id + ".png") => ({
  id, type: "IMAGE", layer, visible: true, locked: false,
  image: { url, mime: "image/png", width: 100, height: 100 }, metadata: {},
});
const libraryCharacter = (url = "https://assets.test/library-flash.png") => ({
  name: "Efeito de disparo",
  type: "CHARACTER",
  image: { url, mime: "image/png", width: 100, height: 100 },
});
const valid = () => ({
  character: image("character"),
  target: image("target", "PROP"),
  animation: libraryCharacter(),
});

test("troca no início, som após 1 s e restauração 4 s após a troca", () => {
  assert.equal(SHOT_SOUND_DELAY_MS, 1000);
  assert.equal(SHOT_DURATION_MS, 4000);
  assert.equal(SHOT_AFTER_SOUND_MS, 3000);
  assert.equal(SHOT_SOUND_DELAY_MS + SHOT_AFTER_SOUND_MS, SHOT_DURATION_MS);
});
test("aceita personagem, alvo e token da biblioteca de personagens distintos", () => {
  assert.equal(canStartShot(valid()), true);
});
test("recusa personagem fora da camada CHARACTER, bloqueado ou invisível", () => {
  const v = valid();
  assert.equal(canStartShot({ ...v, character: image("c", "PROP") }), false);
  assert.equal(canStartShot({ ...v, character: { ...v.character, locked: true } }), false);
  assert.equal(canStartShot({ ...v, character: { ...v.character, visible: false } }), false);
});
test("recusa alvo invisível, alvo da camada MAP e token de animação que veio da cena", () => {
  const v = valid();
  assert.equal(canStartShot({ ...v, target: { ...v.target, visible: false } }), false);
  assert.equal(canStartShot({ ...v, target: image("t", "MAP") }), false);
  assert.equal(canStartShot({ ...v, animation: image("scene-animation", "CHARACTER") }), false);
});
test("recusa autoalvo e recurso da biblioteca com a mesma imagem do personagem", () => {
  const v = valid();
  assert.equal(canStartShot({ ...v, target: v.character }), false);
  assert.equal(canStartShot({ ...v, animation: libraryCharacter(v.character.image.url) }), false);
});
test("só restaura se marcador e imagem temporária ainda pertencem ao disparo", () => {
  const shot = {
    shotId: "shot-1", markerKey: "extension/active-shot",
    temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
  };
  const during = {
    ...image("character"),
    image: { ...shot.temporaryImage, width: 100, height: 100 },
    metadata: { [shot.markerKey]: { shotId: shot.shotId } },
  };
  assert.equal(canRestoreShot(during, shot), true);
  assert.equal(hasShotMarker(during, shot), true);
  const edited = { ...during, image: { ...during.image, url: "https://user/edited.png" } };
  assert.equal(canRestoreShot(edited, shot), false);
  assert.equal(hasShotMarker(edited, shot), true);
});
test("a arbitragem de claims é determinística em caso de empate", () => {
  const claims = [
    { shotId: "b", connectionId: "player-b", createdAt: 100 },
    { shotId: "a", connectionId: "player-a", createdAt: 100 },
  ];
  assert.equal([...claims].sort(compareClaims)[0].shotId, "a");
  assert.equal([...claims].reverse().sort(compareClaims)[0].shotId, "a");
});