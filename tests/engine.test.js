import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSITION_DURATION_MS,
  CONFIG_KEY,
  TRANSITION_KEY,
  createTransitionSchedule,
  normalizeConfig,
  getAvailableActions,
  canStartAction,
  createTransitionMarker,
  isValidTransitionMarker,
  getRemainingMs,
  isSameTransitionVisible,
  compareClaims,
  applyImageToItem,
} from "../src/engine.js";

const image = (url, width = 512, height = 512) => ({ url, mime: "image/png", width, height });
const idle = { id: "idle", name: "Idle", image: image("idle.png") };
const pistol = { id: "pistol", name: "Idle Pistola", image: image("pistol.png") };
const attack = {
  id: "fire-pistol", name: "Disparar pistola", kind: "attack",
  fromStateId: "pistol", toStateId: "pistol", transitionImage: image("shoot.png"),
};
const drawPistol = {
  id: "draw-pistol", name: "Pegar pistola", kind: "transition",
  fromStateId: "idle", toStateId: "pistol", transitionImage: image("draw.png"),
};
const config = normalizeConfig({ version: 1, idleStateId: "idle", states: [idle, pistol], actions: [attack, drawPistol] });
const token = (state, marker = null) => ({
  id: "token-1", type: "IMAGE", layer: "CHARACTER", visible: true, locked: false,
  image: state.image,
  metadata: {
    [CONFIG_KEY]: config,
    ...(marker ? { [TRANSITION_KEY]: marker } : {}),
  },
});

test("a duração transitória é exatamente 4000 ms", () => {
  const schedule = createTransitionSchedule(123456);
  assert.equal(TRANSITION_DURATION_MS, 4000);
  assert.equal(schedule.startedAt, 123456);
  assert.equal(schedule.endsAt, 127456);
  assert.equal(schedule.endsAt - schedule.startedAt, 4000);
});

test("ações disponíveis respeitam o estado atual", () => {
  assert.deepEqual(getAvailableActions(config, { stateId: "idle" }).map((item) => item.id), ["draw-pistol"]);
  assert.deepEqual(getAvailableActions(config, { stateId: "pistol" }).map((item) => item.id), ["fire-pistol"]);
  assert.deepEqual(getAvailableActions(config, { stateId: "pistol" }, { id: "busy" }), []);
});

test("a transição só começa a partir do estado de origem correto", () => {
  assert.equal(canStartAction({ token: token(idle), config, runtime: { stateId: "idle" }, action: drawPistol }), true);
  assert.equal(canStartAction({ token: token(pistol), config, runtime: { stateId: "pistol" }, action: drawPistol }), false);
  assert.equal(canStartAction({ token: token(pistol), config, runtime: { stateId: "pistol" }, action: attack }), true);
});

test("ataque retorna ao mesmo estado e à imagem de arma correspondente", () => {
  assert.equal(attack.fromStateId, attack.toStateId);
  assert.equal(config.states.find((state) => state.id === attack.toStateId).image.url, "pistol.png");
});

test("marcador válido agenda o fim no instante correto", () => {
  const marker = createTransitionMarker({
    tokenId: "token-1", action: drawPistol, sourceStateId: "idle",
    finalImage: pistol.image, startedAt: 1000, leaseKey: "lease", leaseClaimId: "claim",
  });
  assert.equal(isValidTransitionMarker(marker), true);
  assert.equal(marker.endsAt, 5000);
  assert.equal(getRemainingMs(marker, 3500), 1500);
  assert.equal(getRemainingMs(marker, 6000), 0);
});

test("restauração só é autorizada se a mesma pose transitória ainda estiver visível", () => {
  const marker = createTransitionMarker({
    tokenId: "token-1", action: drawPistol, sourceStateId: "idle",
    finalImage: pistol.image, startedAt: 1000, leaseKey: "lease", leaseClaimId: "claim",
  });
  const activeToken = token(idle, marker);
  activeToken.image = image("draw.png");
  assert.equal(isSameTransitionVisible(activeToken, marker), true);
  activeToken.image = image("manual-edit.png");
  assert.equal(isSameTransitionVisible(activeToken, marker), false);
});

test("reivindicações concorrentes têm ordenação determinística", () => {
  const a = { createdAt: 100, connectionId: "b", claimId: "a" };
  const b = { createdAt: 100, connectionId: "a", claimId: "b" };
  assert.ok(compareClaims(b, a) < 0);
});

test("normaliza configurações e descarta ações com estados inexistentes", () => {
  const cleaned = normalizeConfig({
    version: 1,
    idleStateId: "missing",
    states: [idle, { id: "broken", name: "Inválido", image: { url: "", mime: "image/png" } }],
    actions: [drawPistol, { ...attack, toStateId: "missing" }],
  });
  assert.equal(cleaned.idleStateId, "idle");
  assert.deepEqual(cleaned.states.map((state) => state.id), ["idle"]);
  assert.equal(cleaned.actions.length, 0);
});

test("trocar a imagem preserva tamanho aparente, rotação e posição", () => {
  const item = {
    image: { url: "old.png", mime: "image/png", width: 100, height: 200 },
    scale: { x: 2, y: 3 },
    rotation: 45,
    position: { x: 120, y: 240 },
  };
  applyImageToItem(item, image("new.png", 200, 400));
  assert.equal(item.image.url, "new.png");
  assert.deepEqual(item.scale, { x: 1, y: 1.5 });
  assert.equal(item.image.width, 200);
  assert.equal(item.image.height, 400);
  assert.equal(item.image.width * item.scale.x, 200);
  assert.equal(item.image.height * item.scale.y, 600);
  assert.equal(item.rotation, 45);
  assert.deepEqual(item.position, { x: 120, y: 240 });
});
