import test from "node:test";
import assert from "node:assert/strict";
import {
  SHOT_DURATION_MS, canRestoreShot, canStartShot, compareClaims, hasShotMarker,
} from "../src/shot-engine.js";

const image = (id, layer = "CHARACTER", url = `https://assets.test/${id}.png`) => ({
  id, type: "IMAGE", layer, visible: true, locked: false,
  image: { url, mime: "image/png", width: 100, height: 100 }, metadata: {},
});
const valid = () => ({
  character: image("character"),
  target: image("target", "PROP"),
  animation: image("animation", "PROP"),
});

test("a duração da troca é exatamente 4000 ms", () => {
  assert.equal(SHOT_DURATION_MS, 4000);
});
test("aceita personagem, alvo e imagem distintos", () => {
  assert.equal(canStartShot(valid()), true);
});
test("recusa personagem fora da camada CHARACTER, bloqueado ou invisível", () => {
  const v = valid();
  assert.equal(canStartShot({ ...v, character: image("c", "PROP") }), false);
  assert.equal(canStartShot({ ...v, character: { ...v.character, locked: true } }), false);
  assert.equal(canStartShot({ ...v, character: { ...v.character, visible: false } }), false);
});
test("recusa alvo ou animação invisível e imagem da camada MAP", () => {
  const v = valid();
  assert.equal(canStartShot({ ...v, target: { ...v.target, visible: false } }), false);
  assert.equal(canStartShot({ ...v, target: image("t", "MAP") }), false);
  assert.equal(canStartShot({ ...v, animation: image("a", "MAP") }), false);
});
test("recusa autoalvo e imagem de animação igual à aparência atual", () => {
  const v = valid();
  assert.equal(canStartShot({ ...v, target: v.character }), false);
  assert.equal(canStartShot({ ...v, animation: image("a", "PROP", v.character.image.url) }), false);
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
