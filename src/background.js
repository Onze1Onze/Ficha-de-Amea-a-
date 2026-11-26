import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  SHOT_SOUND_DELAY_MS, SHOT_DURATION_MS, CASING_SOUND_DELAY_MS, CLAIM_SETTLE_MS, LEASE_TTL_MS,
  createShotTiming, createShotFromMarker, isValidShotSchedule, shouldScheduleShotSound, shouldScheduleCasingSound, getCasingSoundAt,
  canStartShot, compareClaims, canRestoreShot,
} from "./shot-engine.js";

const ID = "com.onze1.sistema-ameaca";
const REQUEST = ID + "/request";
const CLAIM = ID + "/claim";
const EVENTS = ID + "/events";
const MARKER = ID + "/active-shot";
const LEASE = ID + "/scene-lease";
const AUDIO = new URL("../audio/shotgun-20-gauge.mp3", import.meta.url).href;
const CASING_AUDIO = "https://sfxmint.com/dl/bullet-casing-06.mp3";
const casingAudioPlayer = new Audio(CASING_AUDIO);
casingAudioPlayer.preload = "auto";
casingAudioPlayer.load();

const claims = new Map();
const timers = new Map();
const soundTimers = new Map();
const casingTimers = new Map();
const scheduled = new Map();

let connectionId = "";
let sceneReady = false;
let recoveryPromise = Promise.resolve();

async function reply(requestId, ok, message) {
  if (typeof requestId !== "string" || !requestId) return;
  try {
    await OBR.broadcast.sendMessage(
      EVENTS,
      { type: "status", requestId, ok, message },
      { destination: "LOCAL" }
    );
  } catch (error) {
    console.warn("Sistema Ameaça: falha ao responder ao painel", error);
  }
}

async function getImages(ids) {
  const wanted = new Set(ids);
  const items = await OBR.scene.items.getItems(item => wanted.has(item.id));
  return items.filter(isImage);
}

async function releaseLease(shotId) {
  if (!shotId) return;
  try {
    const metadata = await OBR.scene.getMetadata();
    if (metadata?.[LEASE]?.shotId === shotId) {
      const next = { ...metadata };
      delete next[LEASE];
      await OBR.scene.setMetadata(next);
    }
  } catch (error) {
    console.warn("Sistema Ameaça: a concessão temporária expirará automaticamente", error);
  }
}

async function acquireLease(shotId) {
  const metadata = await OBR.scene.getMetadata();
  const current = metadata?.[LEASE];
  if (current && current.shotId !== shotId && current.expiresAt > Date.now()) return false;

  await OBR.scene.setMetadata({
    ...metadata,
    [LEASE]: { shotId, expiresAt: Date.now() + LEASE_TTL_MS },
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const check = await OBR.scene.getMetadata();
  return check?.[LEASE]?.shotId === shotId;
}

function pruneClaims() {
  const now = Date.now();
  for (const [id, claim] of claims) {
    if (now - claim.receivedAt > 1500) claims.delete(id);
  }
}

async function winClaim(shot) {
  claims.set(shot.shotId, { ...shot, receivedAt: Date.now() });
  await OBR.broadcast.sendMessage(CLAIM, { type: "claim", ...shot }, { destination: "ALL" });
  await new Promise(resolve => setTimeout(resolve, CLAIM_SETTLE_MS));
  pruneClaims();

  return [...claims.values()]
    .filter(claim => Date.now() - claim.receivedAt <= CLAIM_SETTLE_MS + 250)
    .sort(compareClaims)[0]?.shotId === shot.shotId;
}

function clearSoundTimer(shotId) {
  const timer = soundTimers.get(shotId);
  if (timer) clearTimeout(timer);
  soundTimers.delete(shotId);

  const casingTimer = casingTimers.get(shotId);
  if (casingTimer) clearTimeout(casingTimer);
  casingTimers.delete(shotId);
}

async function playAudioForShot(shot, url, volume, label) {
  try {
    if (!(await OBR.scene.isReady())) return;

    const character = (await getImages([shot.characterId]))
      .find(item => item.id === shot.characterId);

    if (!character || !canRestoreShot(character, shot)) return;

    const audio = url === CASING_AUDIO ? casingAudioPlayer : new Audio(url);
    if (url === CASING_AUDIO) {
      audio.pause();
      audio.currentTime = 0;
    }
    audio.volume = volume;
    audio.preload = "auto";
    await audio.play();
  } catch (error) {
    console.warn("Sistema Ameaça: não foi possível reproduzir o áudio (" + label + ")", error);
  }
}

async function playShotSound(shot) {
  await playAudioForShot(shot, AUDIO, 0.72, "disparo");
}

async function playCasingSound(shot) {
  await playAudioForShot(shot, CASING_AUDIO, 1, "cartucho");
}

function scheduleSound(shot) {
  if (!isValidShotSchedule(shot) || soundTimers.has(shot.shotId)) return;

  const delay = Math.max(0, shot.soundAt - Date.now());
  const timer = setTimeout(() => {
    soundTimers.delete(shot.shotId);
    void playShotSound(shot);
  }, delay);

  soundTimers.set(shot.shotId, timer);
}

function scheduleCasingSound(shot) {
  if (!isValidShotSchedule(shot) || casingTimers.has(shot.shotId)) return;

  const delay = Math.max(0, getCasingSoundAt(shot) - Date.now());
  const timer = setTimeout(() => {
    casingTimers.delete(shot.shotId);
    void playCasingSound(shot);
  }, delay);

  casingTimers.set(shot.shotId, timer);
}

function adoptShotMarker(item, force = false) {
  const shot = createShotFromMarker(item, MARKER);
  if (!shot) return;

  if (force || !scheduled.has(shot.shotId)) {
    scheduleRestore(shot);
  }

  if (shouldScheduleShotSound(shot)) scheduleSound(shot);
  if (shouldScheduleCasingSound(shot)) scheduleCasingSound(shot);
}

async function reconcileSceneShots() {
  if (!sceneReady || !(await OBR.scene.isReady())) return;

  const items = await OBR.scene.items.getItems(isImage);
  for (const item of items) {
    if (item.metadata?.[MARKER]) adoptShotMarker(item, true);
  }
}

function startRecovery() {
  recoveryPromise = reconcileSceneShots().catch(error => {
    console.error("Sistema Ameaça: falha ao recuperar disparos pendentes", error);
  });
  return recoveryPromise;
}

async function restore(shot) {
  if (!(await OBR.scene.isReady())) return false;

  await OBR.scene.items.updateItems(
    item => item.id === shot.characterId,
    drafts => {
      for (const item of drafts) {
        if (item.id !== shot.characterId || !isImage(item)) continue;

        const marker = item.metadata?.[MARKER];
        if (!marker || marker.shotId !== shot.shotId) continue;

        if (
          canRestoreShot(item, shot) &&
          marker.originalImage &&
          typeof marker.originalImage.url === "string" &&
          typeof marker.originalImage.mime === "string"
        ) {
          item.image.url = marker.originalImage.url;
          item.image.mime = marker.originalImage.mime;
        }

        const metadata = { ...(item.metadata ?? {}) };
        delete metadata[MARKER];
        item.metadata = metadata;
      }
    }
  );

  clearSoundTimer(shot.shotId);
  await releaseLease(shot.shotId);
  return true;
}

function scheduleRestore(shot) {
  if (!isValidShotSchedule(shot)) return;

  scheduled.set(shot.shotId, shot);
  const previous = timers.get(shot.shotId);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(async () => {
    timers.delete(shot.shotId);
    try {
      const done = await restore(shot);
      if (done) {
        scheduled.delete(shot.shotId);
      } else {
        scheduleRestore({ ...shot, restoreAt: Date.now() + 500 });
      }
    } catch (error) {
      console.error("Sistema Ameaça: restauração falhou; uma nova tentativa será feita", error);
      const retries = (shot.retries ?? 0) + 1;
      const retryDelay = Math.min(5000, 250 * (2 ** Math.min(retries, 4)));
      scheduleRestore({
        ...shot,
        retries,
        restoreAt: Date.now() + retryDelay,
      });
    }
  }, Math.max(0, shot.restoreAt - Date.now()));

  timers.set(shot.shotId, timer);
}

async function fire(request) {
  const requestId = request?.requestId;
  let shotId = "";
  let leased = false;
  let changed = false;
  let shot = null;

  try {
    if (
      request?.type !== "fire" ||
      typeof requestId !== "string" ||
      !requestId ||
      typeof request.characterId !== "string" ||
      !request.characterId ||
      typeof request.targetId !== "string" ||
      !request.targetId
    ) {
      await reply(requestId, false, "O comando de disparo está incompleto. Atualize o painel e tente novamente.");
      return;
    }

    await recoveryPromise;
    if (!sceneReady || !(await OBR.scene.isReady())) {
      await reply(requestId, false, "A cena ainda não está pronta.");
      return;
    }
    if (scheduled.size > 0) {
      await reply(requestId, false, "Já existe um disparo em andamento nesta cena.");
      return;
    }

    const { characterId, targetId, animation } = request;
    const [items, role] = await Promise.all([
      getImages([characterId, targetId]),
      OBR.player.getRole(),
    ]);
    const character = items.find(item => item.id === characterId);
    const target = items.find(item => item.id === targetId);

    if (!canStartShot({ character, target, animation })) {
      await reply(requestId, false, "Seleção inválida. Escolha personagem, alvo e um token da biblioteca de personagens.");
      return;
    }
    if (character.metadata?.[MARKER]) {
      await reply(requestId, false, "Este personagem já possui um disparo em andamento.");
      return;
    }

    if (role !== "GM" && !(await OBR.player.hasPermission("CHARACTER_UPDATE"))) {
      await reply(requestId, false, "A sala não permite que este jogador atualize tokens de personagem.");
      return;
    }

    shotId = crypto.randomUUID();
    const claim = { shotId, connectionId, createdAt: Date.now() };
    if (!(await winClaim(claim))) {
      await reply(requestId, false, "Outro jogador iniciou um disparo ao mesmo tempo.");
      return;
    }

    leased = await acquireLease(shotId);
    if (!leased) {
      await reply(requestId, false, "Outro disparo está ocupando a cena.");
      return;
    }

    const selectedIds = new Set([characterId, targetId]);
    const temporaryImage = {
      url: animation.image.url,
      mime: animation.image.mime,
    };

    await OBR.scene.items.updateItems(
      item => selectedIds.has(item.id) && isImage(item),
      drafts => {
        const currentCharacter = drafts.find(item => item.id === characterId);
        const currentTarget = drafts.find(item => item.id === targetId);

        if (
          !canStartShot({
            character: currentCharacter,
            target: currentTarget,
            animation,
          }) ||
          currentCharacter.metadata?.[MARKER]
        ) {
          return;
        }

        const startedAt = Date.now();
        const timing = createShotTiming(startedAt);
        const originalImage = {
          url: currentCharacter.image.url,
          mime: currentCharacter.image.mime,
        };
        const marker = {
          shotId,
          originalImage,
          temporaryImage,
          startedAt: timing.startedAt,
          soundAt: timing.soundAt,
          casingAt: timing.casingAt,
          restoreAt: timing.restoreAt,
          connectionId,
        };

        currentCharacter.image.url = temporaryImage.url;
        currentCharacter.image.mime = temporaryImage.mime;
        currentCharacter.metadata = {
          ...(currentCharacter.metadata ?? {}),
          [MARKER]: marker,
        };

        shot = {
          shotId,
          characterId,
          markerKey: MARKER,
          temporaryImage,
          ...timing,
          connectionId,
        };
        changed = true;
      }
    );

    if (!changed || !shot) {
      await reply(requestId, false, "Um dos tokens mudou antes da troca visual. Atualize as seleções e tente novamente.");
      return;
    }

    scheduleRestore(shot);
    scheduleSound(shot);
    scheduleCasingSound(shot);

    try {
      await OBR.broadcast.sendMessage(
        EVENTS,
        { type: "started", ...shot },
        { destination: "ALL" }
      );
    } catch (error) {
      console.warn("Sistema Ameaça: sincronização por mensagem falhou; os outros clientes recuperarão o marcador da cena", error);
    }

    await reply(
      requestId,
      true,
      "Aparência trocada. Som em 1 segundo; restauração 3 segundos depois do som."
    );
  } catch (error) {
    console.error("Sistema Ameaça: falha no disparo", error);

    if (changed && shot) {
      try {
        const done = await restore(shot);
        if (done) scheduled.delete(shot.shotId);
      } catch (restoreError) {
        console.error("Sistema Ameaça: a restauração de emergência falhou; o marcador será recuperado na próxima inicialização", restoreError);
      }
    }

    await reply(requestId, false, "Falha ao executar o disparo. A extensão tentou restaurar a aparência original.");
  } finally {
    if (shotId) claims.delete(shotId);
    if (leased && !changed) await releaseLease(shotId);
  }
}

OBR.onReady(async () => {
  try {
    connectionId = await OBR.player.getConnectionId();
    sceneReady = await OBR.scene.isReady();

    OBR.broadcast.onMessage(REQUEST, event => {
      if (event.data?.type === "fire") {
        void fire(event.data).catch(error => {
          console.error("Sistema Ameaça: comando não tratado", error);
          void reply(event.data?.requestId, false, "O serviço da extensão encontrou um erro inesperado.");
        });
      }
    });

    OBR.broadcast.onMessage(CLAIM, event => {
      const data = event.data;
      if (data?.type === "claim" && data.shotId) {
        claims.set(data.shotId, { ...data, receivedAt: Date.now() });
      }
    });

    OBR.broadcast.onMessage(EVENTS, event => {
      const data = event.data;
      if (data?.type !== "started" || !data.shotId) return;

      const shot = {
        ...data,
        markerKey: MARKER,
        temporaryImage: data.temporaryImage,
      };
      if (!isValidShotSchedule(shot)) return;

      if (!scheduled.has(shot.shotId)) scheduleRestore(shot);
      if (shouldScheduleShotSound(shot)) scheduleSound(shot);
      if (shouldScheduleCasingSound(shot)) scheduleCasingSound(shot);
    });

    OBR.scene.items.onChange(items => {
      for (const item of items) {
        if (item?.metadata?.[MARKER]) adoptShotMarker(item);
      }
    });

    OBR.scene.onReadyChange(ready => {
      sceneReady = ready;
      if (ready) void startRecovery();
    });

    if (sceneReady) await startRecovery();
  } catch (error) {
    console.error("Sistema Ameaça: falha ao iniciar o serviço de background", error);
  }
});

window.addEventListener("pagehide", () => {
  for (const timer of timers.values()) clearTimeout(timer);
  for (const timer of soundTimers.values()) clearTimeout(timer);
  for (const timer of casingTimers.values()) clearTimeout(timer);
  timers.clear();
  soundTimers.clear();
  casingTimers.clear();
});

window.addEventListener("pageshow", () => {
  if (sceneReady) void startRecovery();
});
