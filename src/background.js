import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  SHOT_SOUND_DELAY_MS, SHOT_DURATION_MS, CLAIM_SETTLE_MS, LEASE_TTL_MS,
  canStartShot, compareClaims, canRestoreShot, hasShotMarker,
} from "./shot-engine.js";

const ID = "com.onze1.sistema-ameaca";
const REQUEST = ID + "/request";
const CLAIM = ID + "/claim";
const EVENTS = ID + "/events";
const MARKER = ID + "/active-shot";
const LEASE = ID + "/scene-lease";
const AUDIO = new URL("../audio/shotgun-20-gauge.mp3", import.meta.url).href;
const claims = new Map();
const timers = new Map();
const soundTimers = new Map();
const scheduled = new Map();
let connectionId = "";
let sceneReady = false;

async function reply(requestId, ok, message) {
  try {
    await OBR.broadcast.sendMessage(EVENTS, { type: "status", requestId, ok, message }, { destination: "LOCAL" });
  } catch (error) { console.warn("Sistema Ameaça: falha ao responder ao painel", error); }
}

async function getImages(ids) {
  const wanted = new Set(ids);
  const items = await OBR.scene.items.getItems(item => wanted.has(item.id));
  return items.filter(isImage);
}

async function sound() {
  const audio = new Audio(AUDIO);
  audio.volume = 0.72;
  audio.preload = "auto";
  try { await audio.play(); }
  catch (error) { console.warn("Sistema Ameaça: áudio bloqueado pelo navegador", error); }
}

function scheduleSound(shot) {
  const previous = soundTimers.get(shot.shotId);
  if (previous) clearTimeout(previous);

  const soundAt = Number.isFinite(shot.soundAt)
    ? shot.soundAt
    : shot.startedAt + SHOT_SOUND_DELAY_MS;
  const timer = setTimeout(() => {
    soundTimers.delete(shot.shotId);
    void sound();
  }, Math.max(0, soundAt - Date.now()));
  soundTimers.set(shot.shotId, timer);
}

function clearSoundTimer(shotId) {
  const timer = soundTimers.get(shotId);
  if (timer) clearTimeout(timer);
  soundTimers.delete(shotId);
}

function pruneClaims() {
  const now = Date.now();
  for (const [id, claim] of claims) if (now - claim.receivedAt > 1500) claims.delete(id);
}

async function winClaim(shot) {
  claims.set(shot.shotId, { ...shot, receivedAt: Date.now() });
  await OBR.broadcast.sendMessage(CLAIM, { type: "claim", ...shot }, { destination: "ALL" });
  await new Promise(resolve => setTimeout(resolve, CLAIM_SETTLE_MS));
  pruneClaims();
  return [...claims.values()].filter(c => Date.now() - c.receivedAt <= CLAIM_SETTLE_MS + 250).sort(compareClaims)[0]?.shotId === shot.shotId;
}

async function acquireLease(shotId) {
  const metadata = await OBR.scene.getMetadata();
  const current = metadata?.[LEASE];
  if (current && current.shotId !== shotId && current.expiresAt > Date.now()) return false;
  await OBR.scene.setMetadata({ ...metadata, [LEASE]: { shotId, expiresAt: Date.now() + LEASE_TTL_MS } });
  await new Promise(resolve => setTimeout(resolve, 100));
  const check = await OBR.scene.getMetadata();
  return check?.[LEASE]?.shotId === shotId;
}

async function releaseLease(shotId) {
  try {
    const metadata = await OBR.scene.getMetadata();
    if (metadata?.[LEASE]?.shotId === shotId) {
      const next = { ...metadata };
      delete next[LEASE];
      await OBR.scene.setMetadata(next);
    }
  } catch (error) { console.warn("Sistema Ameaça: concessão expira sozinha", error); }
}

async function restore(shot) {
  if (!(await OBR.scene.isReady())) return false;
  const items = await getImages([shot.characterId]);
  const character = items.find(item => item.id === shot.characterId);
  if (!character || !hasShotMarker(character, shot)) {
    clearSoundTimer(shot.shotId);
    await releaseLease(shot.shotId);
    return true;
  }
  await OBR.scene.items.updateItems([character], drafts => {
    for (const item of drafts) {
      if (item.id !== shot.characterId || !isImage(item)) continue;
      const marker = item.metadata?.[MARKER];
      if (!marker || marker.shotId !== shot.shotId) continue;
      if (canRestoreShot(item, shot)) {
        item.image = { ...item.image, ...marker.originalImage };
      }
      const metadata = { ...(item.metadata ?? {}) };
      delete metadata[MARKER];
      item.metadata = metadata;
    }
  });
  clearSoundTimer(shot.shotId);
  await releaseLease(shot.shotId);
  return true;
}

function scheduleRestore(shot) {
  scheduled.set(shot.shotId, shot);
  const old = timers.get(shot.shotId);
  if (old) clearTimeout(old);
  const timer = setTimeout(async () => {
    timers.delete(shot.shotId);
    try {
      const done = await restore(shot);
      if (done) scheduled.delete(shot.shotId);
      else if (timers.size < 20) scheduleRestore({ ...shot, restoreAt: Date.now() + 500 });
    } catch (error) {
      console.error("Sistema Ameaça: restauração falhou", error);
      const retries = (shot.retries ?? 0) + 1;
      if (retries <= 4 && Date.now() < shot.restoreAt + LEASE_TTL_MS) scheduleRestore({ ...shot, retries });
    }
  }, Math.max(0, shot.restoreAt - Date.now()));
  timers.set(shot.shotId, timer);
}

async function fire(request) {
  const { requestId, characterId, targetId, animation } = request;
  if (!sceneReady || !(await OBR.scene.isReady())) return reply(requestId, false, "A cena ainda não está pronta.");
  if (timers.size) return reply(requestId, false, "Já existe um disparo em andamento nesta cena.");
  const [items, role, canUpdate] = await Promise.all([
    getImages([characterId, targetId]),
    OBR.player.getRole(),
    OBR.player.hasPermission("CHARACTER_UPDATE"),
  ]);
  const character = items.find(item => item.id === characterId);
  const target = items.find(item => item.id === targetId);
  if (!canStartShot({ character, target, animation })) {
    return reply(requestId, false, "Seleção inválida. Escolha personagem, alvo e um token da biblioteca de personagens.");
  }
  if (role !== "GM" && !canUpdate) return reply(requestId, false, "A sala não permite que este jogador atualize tokens de personagem.");
  if (character.metadata?.[MARKER]) return reply(requestId, false, "Este personagem já está em uma animação.");

  const shotId = crypto.randomUUID();
  const claim = { shotId, connectionId, createdAt: Date.now() };
  let leased = false;
  let changed = false;
  try {
    if (!(await winClaim(claim))) return reply(requestId, false, "Outro jogador iniciou um disparo ao mesmo tempo.");
    leased = await acquireLease(shotId);
    if (!leased) return reply(requestId, false, "Outro disparo está ocupando a cena.");
    const fresh = await getImages([characterId, targetId]);
    const currentCharacter = fresh.find(item => item.id === characterId);
    const currentTarget = fresh.find(item => item.id === targetId);
    if (
      !canStartShot({ character: currentCharacter, target: currentTarget, animation }) ||
      currentCharacter.lastModified !== character.lastModified ||
      currentCharacter.image.url !== character.image.url
    ) {
      return reply(requestId, false, "Um dos tokens mudou antes do disparo. Atualize as seleções e tente novamente.");
    }
    const originalImage = { ...currentCharacter.image };
    const temporaryImage = { url: animation.image.url, mime: animation.image.mime };
    const marker = { shotId, originalImage, temporaryImage };
    await OBR.scene.items.updateItems([currentCharacter], drafts => {
      for (const item of drafts) {
        if (item.id !== characterId || !isImage(item) || item.metadata?.[MARKER]) continue;
        item.image.url = temporaryImage.url;
        item.image.mime = temporaryImage.mime;
        item.metadata = { ...(item.metadata ?? {}), [MARKER]: marker };
        changed = true;
      }
    });
    if (!changed) return reply(requestId, false, "O Owlbear Rodeo não aplicou a troca visual.");

    const startedAt = Date.now();
    const shot = {
      shotId,
      characterId,
      markerKey: MARKER,
      temporaryImage,
      startedAt,
      soundAt: startedAt + SHOT_SOUND_DELAY_MS,
      restoreAt: startedAt + SHOT_DURATION_MS,
      connectionId,
    };
    scheduleRestore(shot);
    scheduleSound(shot);

    try {
      await OBR.broadcast.sendMessage(EVENTS, { type: "started", ...shot }, { destination: "ALL" });
    } catch (error) {
      console.warn("Sistema Ameaça: não foi possível sincronizar o disparo com outros jogadores", error);
    }
    await reply(requestId, true, "Aparência trocada. Som em 1 segundo; restauração 3 segundos depois do som.");
  } catch (error) {
    console.error("Sistema Ameaça: falha no disparo", error);
    if (changed) {
      const marker = (await getImages([characterId])).find(item => item.id === characterId)?.metadata?.[MARKER];
      if (marker?.shotId === shotId) {
        await restore({
          shotId,
          characterId,
          markerKey: MARKER,
          temporaryImage: marker.temporaryImage,
        });
      }
    }
    await reply(requestId, false, "Falha ao executar o disparo. A restauração foi tentada.");
  } finally {
    claims.delete(shotId);
    if (leased && !changed) await releaseLease(shotId);
  }
}

OBR.onReady(async () => {
  connectionId = await OBR.player.getConnectionId();
  sceneReady = await OBR.scene.isReady();
  OBR.broadcast.onMessage(REQUEST, event => {
    if (event.data?.type === "fire") void fire(event.data).catch(error => console.error("Sistema Ameaça: comando falhou", error));
  });
  OBR.broadcast.onMessage(CLAIM, event => {
    const data = event.data;
    if (data?.type === "claim" && data.shotId) claims.set(data.shotId, { ...data, receivedAt: Date.now() });
  });
  OBR.broadcast.onMessage(EVENTS, event => {
    const data = event.data;
    if (data?.type !== "started" || !data.shotId) return;
    const startedAt = Number.isFinite(data.startedAt) ? data.startedAt : Date.now();
    const shot = {
      ...data,
      startedAt,
      soundAt: Number.isFinite(data.soundAt) ? data.soundAt : startedAt + SHOT_SOUND_DELAY_MS,
      restoreAt: Number.isFinite(data.restoreAt) ? data.restoreAt : startedAt + SHOT_DURATION_MS,
    };
    if (data.connectionId !== connectionId) scheduleSound(shot);
    scheduleRestore(shot);
  });
  OBR.scene.onReadyChange(ready => {
    sceneReady = ready;
    if (ready) {
      for (const shot of scheduled.values()) {
        if (Date.now() >= shot.restoreAt) scheduleRestore(shot);
      }
    }
  });
  window.addEventListener("pagehide", () => {
    for (const timer of timers.values()) clearTimeout(timer);
    for (const timer of soundTimers.values()) clearTimeout(timer);
    timers.clear();
    soundTimers.clear();
  });
});