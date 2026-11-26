import test from "node:test";
import assert from "node:assert/strict";
import {
  SHOT_SOUND_DELAY_MS,
  SHOT_DURATION_MS,
  SHOT_AFTER_SOUND_MS,
  CASING_SOUND_DELAY_MS,
  createShotTiming,
  createShotFromMarker,
  shouldScheduleShotSound,
  shouldScheduleCasingSound,
  getCasingSoundAt,
  isValidShotSchedule,
  isUsableImage,
  isUsableLibraryCharacter,
  canRestoreShot,
  canStartShot,
  compareClaims,
  hasShotMarker,
} from "../src/shot-engine.js";

const image = (id, layer = "CHARACTER", url = "https://assets.test/" + id + ".png") => ({
  id,
  type: "IMAGE",
  layer,
  visible: true,
  locked: false,
  image: { url, mime: "image/png", width: 100, height: 100 },
  metadata: {},
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

const validSchedule = (overrides = {}) => ({
  shotId: "shot-1",
  characterId: "character",
  markerKey: "extension/active-shot",
  temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
  startedAt: 1000,
  soundAt: 2000,
  casingAt: 2450,
  restoreAt: 5000,
  ...overrides,
});

test("sequência temporal mantém som em 1 s e restauração 3 s depois", () => {
  assert.equal(SHOT_SOUND_DELAY_MS, 1000);
  assert.equal(SHOT_DURATION_MS, 4000);
  assert.equal(SHOT_AFTER_SOUND_MS, 3000);
  assert.equal(CASING_SOUND_DELAY_MS, 450);

  const timing = createShotTiming(10_000);
  assert.deepEqual(timing, {
    startedAt: 10_000,
    soundAt: 11_000,
    casingAt: 11_450,
    restoreAt: 14_000,
  });
});

test("rejeita timestamps inválidos ao criar cronograma", () => {
  assert.throws(() => createShotTiming(Number.NaN), RangeError);
  assert.throws(() => createShotTiming(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => createShotTiming(-1), RangeError);
});

test("reconhece cronograma completo e rejeita dados incompletos", () => {
  assert.equal(isValidShotSchedule(validSchedule()), true);
  assert.equal(isValidShotSchedule(null), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), shotId: "" }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), characterId: "" }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), markerKey: "" }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), temporaryImage: null }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), startedAt: NaN }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), soundAt: NaN }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), restoreAt: NaN }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), soundAt: 999 }), false);
  assert.equal(isValidShotSchedule({ ...validSchedule(), restoreAt: 1999 }), false);
});

test("retoma o som durante recuperação somente enquanto o horário ainda está no futuro", () => {
  const shot = validSchedule();
  assert.equal(shouldScheduleShotSound(shot, 1999), true);
  assert.equal(shouldScheduleShotSound(shot, 2000), false);
  assert.equal(shouldScheduleShotSound(shot, 2001), false);
  assert.equal(shouldScheduleShotSound(null, 1000), false);
  assert.equal(shouldScheduleShotSound(shot, Number.NaN), false);
});

test("o cartucho começa 450 ms após o disparo e antes da restauração", () => {
  const shot = validSchedule();
  assert.equal(getCasingSoundAt(shot), 2450);
  assert.equal(shouldScheduleCasingSound(shot, 2449), true);
  assert.equal(shouldScheduleCasingSound(shot, 2450), false);
  assert.equal(shouldScheduleCasingSound(shot, 2451), false);
  assert.equal(shouldScheduleCasingSound(null, 1000), false);
  assert.equal(shouldScheduleCasingSound(shot, Number.NaN), false);
  assert.equal(isValidShotSchedule({ ...shot, casingAt: 1900 }), false);
  assert.equal(isValidShotSchedule({ ...shot, restoreAt: 2400 }), false);
});

test("cronogramas antigos sem casingAt mantêm compatibilidade", () => {
  const legacyEvent = validSchedule();
  delete legacyEvent.casingAt;
  assert.equal(isValidShotSchedule(legacyEvent), true);
  assert.equal(getCasingSoundAt(legacyEvent), 2450);
  assert.equal(shouldScheduleCasingSound(legacyEvent, 2449), true);
});

test("reconstrói horários persistidos a partir do marcador da cena", () => {
  const current = {
    ...image("character"),
    image: { url: "https://assets.test/flash.png", mime: "image/png" },
    metadata: {
      "extension/active-shot": {
        shotId: "persisted-shot",
        originalImage: { url: "https://assets.test/original.png", mime: "image/png" },
        temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
        startedAt: 10_000,
        soundAt: 11_000,
        casingAt: 11_450,
        restoreAt: 14_000,
        connectionId: "player-1",
      },
    },
  };

  assert.deepEqual(createShotFromMarker(current, "extension/active-shot", 20_000), {
    shotId: "persisted-shot",
    characterId: "character",
    markerKey: "extension/active-shot",
    temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
    startedAt: 10_000,
    soundAt: 11_000,
    casingAt: 11_450,
    restoreAt: 14_000,
    connectionId: "player-1",
  });
});

test("marcador antigo sem horários agenda restauração imediata sem tocar áudio atrasado", () => {
  const current = {
    ...image("character"),
    metadata: {
      "extension/active-shot": {
        shotId: "legacy-shot",
        originalImage: { url: "https://assets.test/original.png", mime: "image/png" },
        temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
      },
    },
  };

  assert.deepEqual(createShotFromMarker(current, "extension/active-shot", 30_000), {
    shotId: "legacy-shot",
    characterId: "character",
    markerKey: "extension/active-shot",
    temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
    startedAt: 30_000,
    soundAt: 30_000,
    casingAt: 30_000,
    restoreAt: 30_000,
    connectionId: "",
  });
});

test("ignora marcadores ausentes, incompletos ou com dados inválidos", () => {
  assert.equal(createShotFromMarker(image("character"), "extension/active-shot", 100), null);
  assert.equal(createShotFromMarker(null, "extension/active-shot", 100), null);
  assert.equal(createShotFromMarker(image("character"), "", 100), null);
  assert.equal(createShotFromMarker(image("character"), "extension/active-shot", NaN), null);

  const malformed = {
    ...image("character"),
    metadata: {
      "extension/active-shot": {
        shotId: "bad-shot",
        originalImage: { url: "", mime: "image/png" },
        temporaryImage: { url: "https://assets.test/flash.png", mime: "image/png" },
      },
    },
  };

  assert.equal(createShotFromMarker(malformed, "extension/active-shot", 100), null);
});

test("aceita imagem real da cena com URL válida", () => {
  assert.equal(isUsableImage(image("a")), true);
});

test("rejeita imagem ausente, ID ausente, tipo incorreto e URL vazia", () => {
  assert.equal(isUsableImage(null), false);
  assert.equal(isUsableImage({ ...image("a"), id: "" }), false);
  assert.equal(isUsableImage({ ...image("a"), id: undefined }), false);
  assert.equal(isUsableImage({ ...image("a"), type: "TEXT" }), false);
  assert.equal(isUsableImage({ ...image("a"), image: null }), false);
  assert.equal(isUsableImage({ ...image("a"), image: { url: "" } }), false);
});

test("aceita recurso CHARACTER da biblioteca com imagem e MIME", () => {
  assert.equal(isUsableLibraryCharacter(libraryCharacter()), true);
});

test("rejeita recursos que não são personagens ou não possuem imagem/MIME", () => {
  assert.equal(isUsableLibraryCharacter(null), false);
  assert.equal(isUsableLibraryCharacter({ ...libraryCharacter(), type: "PROP" }), false);
  assert.equal(isUsableLibraryCharacter({ ...libraryCharacter(), image: null }), false);
  assert.equal(isUsableLibraryCharacter({ ...libraryCharacter(), image: { url: "", mime: "image/png" } }), false);
  assert.equal(isUsableLibraryCharacter({ ...libraryCharacter(), image: { url: "x", mime: "" } }), false);
});

test("aceita personagem, alvo e token de animação da biblioteca distintos", () => {
  assert.equal(canStartShot(valid()), true);
});

test("recusa personagem fora da camada CHARACTER", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, character: image("c", "PROP") }), false);
});

test("recusa personagem bloqueado ou invisível", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, character: { ...value.character, locked: true } }), false);
  assert.equal(canStartShot({ ...value, character: { ...value.character, visible: false } }), false);
});

test("recusa personagem que não é imagem", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, character: { ...value.character, type: "TEXT" } }), false);
});

test("recusa alvo invisível", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, target: { ...value.target, visible: false } }), false);
});

test("recusa alvo na camada MAP", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, target: image("map", "MAP") }), false);
});

test("recusa alvo que não é imagem", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, target: { ...value.target, type: "TEXT" } }), false);
});

test("recusa autoalvo", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, target: value.character }), false);
});

test("recusa recurso de animação que veio da cena, e não da biblioteca", () => {
  const value = valid();
  assert.equal(canStartShot({ ...value, animation: image("scene-animation", "CHARACTER") }), false);
});

test("recusa animação com a mesma URL da aparência atual", () => {
  const value = valid();
  assert.equal(
    canStartShot({ ...value, animation: libraryCharacter(value.character.image.url) }),
    false
  );
});

test("só restaura quando o marcador pertence ao disparo e a imagem temporária ainda está aplicada", () => {
  const shot = validSchedule();
  const during = {
    ...image("character"),
    image: { ...shot.temporaryImage, width: 100, height: 100 },
    metadata: { [shot.markerKey]: { shotId: shot.shotId } },
  };

  assert.equal(canRestoreShot(during, shot), true);
  assert.equal(hasShotMarker(during, shot), true);

  const editedUrl = {
    ...during,
    image: { ...during.image, url: "https://user/edited.png" },
  };
  assert.equal(canRestoreShot(editedUrl, shot), false);
  assert.equal(hasShotMarker(editedUrl, shot), true);
});

test("não restaura se o MIME da imagem temporária foi alterado", () => {
  const shot = validSchedule();
  const item = {
    ...image("character"),
    image: { ...shot.temporaryImage, mime: "image/webp" },
    metadata: { [shot.markerKey]: { shotId: shot.shotId } },
  };

  assert.equal(canRestoreShot(item, shot), false);
});

test("não restaura se o marcador pertence a outro disparo", () => {
  const shot = validSchedule();
  const item = {
    ...image("character"),
    image: shot.temporaryImage,
    metadata: { [shot.markerKey]: { shotId: "outro-disparo" } },
  };

  assert.equal(canRestoreShot(item, shot), false);
  assert.equal(hasShotMarker(item, shot), false);
});

test("não restaura se o item ou o cronograma estiverem ausentes", () => {
  assert.equal(canRestoreShot(null, validSchedule()), false);
  assert.equal(canRestoreShot(image("character"), null), false);
});

test("marcador é detectado somente na chave e no disparo correspondentes", () => {
  const shot = validSchedule();
  const item = {
    ...image("character"),
    metadata: { [shot.markerKey]: { shotId: shot.shotId } },
  };

  assert.equal(hasShotMarker(item, shot), true);
  assert.equal(hasShotMarker(item, { ...shot, shotId: "different" }), false);
  assert.equal(hasShotMarker(item, { ...shot, markerKey: "other/key" }), false);
  assert.equal(hasShotMarker(null, shot), false);
});

test("arbitragem ordena primeiro pelo horário de criação", () => {
  const earlier = { shotId: "z", connectionId: "p-z", createdAt: 10 };
  const later = { shotId: "a", connectionId: "p-a", createdAt: 11 };
  assert.ok(compareClaims(earlier, later) < 0);
  assert.ok(compareClaims(later, earlier) > 0);
});

test("arbitragem desempata por connectionId e depois por shotId", () => {
  const claims = [
    { shotId: "b", connectionId: "player-b", createdAt: 100 },
    { shotId: "a", connectionId: "player-a", createdAt: 100 },
    { shotId: "c", connectionId: "player-a", createdAt: 100 },
  ];

  assert.equal([...claims].sort(compareClaims)[0].shotId, "a");
  assert.equal([...claims].reverse().sort(compareClaims)[0].shotId, "a");
});

test("arbitragem é estável mesmo com timestamps ausentes ou inválidos", () => {
  const claims = [
    { shotId: "b", connectionId: "p2", createdAt: Number.NaN },
    { shotId: "a", connectionId: "p1" },
  ];

  assert.equal([...claims].sort(compareClaims)[0].shotId, "a");
  assert.equal(compareClaims(null, null), 0);
});
