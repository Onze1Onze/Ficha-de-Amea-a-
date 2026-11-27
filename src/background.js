import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  CONFIG_KEY,
  RUNTIME_KEY,
  TRANSITION_KEY,
  LEASE_PREFIX,
  normalizeConfig,
  getState,
  getCurrentStateId,
  canStartAction,
  createTransitionMarker,
  isValidTransitionMarker,
  isSameTransitionVisible,
  compareClaims,
  applyImageToItem,
} from "./engine.js";

const ID = "com.onze1.dynamic-token";
const REQUEST_CHANNEL = `${ID}/request`;
const EVENTS_CHANNEL = `${ID}/events`;
const CLAIM_CHANNEL = `${ID}/claim`;
const CLAIM_SETTLE_MS = 300;
const CLAIM_MAX_AGE_MS = 1800;
const LEASE_TTL_MS = 15000;
const MAX_RETRY_MS = 5000;

const claims = new Map();
const timers = new Map();
let connectionId = "";
let sceneReady = false;
let recoveryPromise = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendStatus(requestId, ok, message) {
  if (typeof requestId !== "string" || !requestId) return;
  try {
    await OBR.broadcast.sendMessage(
      EVENTS_CHANNEL,
      { type: "status", requestId, ok, message },
      { destination: "LOCAL" }
    );
  } catch (error) {
    console.warn("Token Dinâmico: não foi possível enviar o retorno ao painel", error);
  }
}

async function getToken(tokenId) {
  const items = await OBR.scene.items.getItems((item) => item.id === tokenId && isImage(item));
  return items.find((item) => item.id === tokenId) ?? null;
}

function leaseKeyFor(tokenId) {
  return LEASE_PREFIX + tokenId;
}

async function acquireLease(tokenId, claimId) {
  const key = leaseKeyFor(tokenId);
  const metadata = await OBR.scene.getMetadata();
  const current = metadata?.[key];
  if (current && current.claimId !== claimId && current.expiresAt > Date.now()) return null;

  await OBR.scene.setMetadata({
    ...metadata,
    [key]: { claimId, expiresAt: Date.now() + LEASE_TTL_MS },
  });
  await sleep(120);
  const verified = await OBR.scene.getMetadata();
  return verified?.[key]?.claimId === claimId ? key : null;
}

async function releaseLease(key, claimId) {
  if (!key || !claimId) return;
  try {
    const metadata = await OBR.scene.getMetadata();
    if (metadata?.[key]?.claimId !== claimId) return;
    const next = { ...metadata };
    delete next[key];
    await OBR.scene.setMetadata(next);
  } catch (error) {
    console.warn("Token Dinâmico: a concessão temporária expirará automaticamente", error);
  }
}

function pruneClaims() {
  const now = Date.now();
  for (const [key, claim] of claims) {
    if (now - claim.receivedAt > CLAIM_MAX_AGE_MS) claims.delete(key);
  }
}

async function winClaim(tokenId, claim) {
  const key = `${tokenId}:${claim.claimId}`;
  claims.set(key, { ...claim, tokenId, receivedAt: Date.now() });
  await OBR.broadcast.sendMessage(CLAIM_CHANNEL, { type: "claim", tokenId, ...claim }, { destination: "ALL" });
  await sleep(CLAIM_SETTLE_MS);
  pruneClaims();
  const contenders = [...claims.values()]
    .filter((candidate) => candidate.tokenId === tokenId && Date.now() - candidate.receivedAt <= CLAIM_SETTLE_MS + 300)
    .sort(compareClaims);
  return contenders[0]?.claimId === claim.claimId;
}

function scheduleFinish(tokenId, marker, force = false) {
  if (!isValidTransitionMarker(marker)) return;
  const timerKey = `${tokenId}:${marker.id}`;
  if (timers.has(timerKey) && !force) return;
  const previous = timers.get(timerKey);
  if (previous) clearTimeout(previous);

  const delay = Math.max(0, marker.endsAt - Date.now());
  const timer = setTimeout(() => {
    timers.delete(timerKey);
    void finishTransition(tokenId, marker, 0);
  }, delay);
  timers.set(timerKey, timer);
}

async function finishTransition(tokenId, marker, attempt) {
  try {
    if (!(await OBR.scene.isReady())) {
      scheduleRetry(tokenId, marker, attempt);
      return;
    }
    // Não faz tentativas repetidas em clientes sem permissão para editar personagens.
    // Outro cliente autorizado (ou a próxima reconexão do Mestre) recuperará o marcador.
    if (!(await getPermission())) return;

    const token = await getToken(tokenId);
    const storedMarker = token?.metadata?.[TRANSITION_KEY];
    if (!token || storedMarker?.id !== marker.id) {
      await releaseLease(marker.leaseKey, marker.leaseClaimId);
      return;
    }

    if (Date.now() < marker.endsAt) {
      scheduleFinish(tokenId, marker, true);
      return;
    }

    let finalized = false;
    let changedByUser = false;
    await OBR.scene.items.updateItems(
      (item) => item.id === tokenId && isImage(item),
      (drafts) => {
        for (const item of drafts) {
          if (item.id !== tokenId || item.metadata?.[TRANSITION_KEY]?.id !== marker.id) continue;
          if (isSameTransitionVisible(item, marker)) {
            applyImageToItem(item, marker.finalImage);
            item.metadata = {
              ...(item.metadata ?? {}),
              [RUNTIME_KEY]: { stateId: marker.toStateId, changedAt: Date.now() },
            };
            finalized = true;
          } else {
            // Uma edição manual feita durante a animação sempre vence a restauração automática.
            changedByUser = true;
          }
          const metadata = { ...(item.metadata ?? {}) };
          delete metadata[TRANSITION_KEY];
          item.metadata = metadata;
        }
      }
    );

    if (!finalized && !changedByUser) {
      scheduleRetry(tokenId, marker, attempt);
      return;
    }
    await releaseLease(marker.leaseKey, marker.leaseClaimId);
  } catch (error) {
    console.error("Token Dinâmico: falha ao concluir uma transição", error);
    scheduleRetry(tokenId, marker, attempt);
  }
}

function scheduleRetry(tokenId, marker, attempt) {
  const delay = Math.min(MAX_RETRY_MS, 250 * (2 ** Math.min(attempt + 1, 5)));
  const timerKey = `${tokenId}:${marker.id}`;
  const previous = timers.get(timerKey);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    timers.delete(timerKey);
    void finishTransition(tokenId, marker, attempt + 1);
  }, delay);
  timers.set(timerKey, timer);
}

async function recoverTransitions() {
  if (!sceneReady || !(await OBR.scene.isReady())) return;
  const items = await OBR.scene.items.getItems(isImage);
  for (const item of items) {
    const marker = item.metadata?.[TRANSITION_KEY];
    if (marker && isValidTransitionMarker(marker)) scheduleFinish(item.id, marker, true);
  }
}

function startRecovery() {
  recoveryPromise = recoverTransitions().catch((error) => {
    console.error("Token Dinâmico: falha ao recuperar transições pendentes", error);
  });
  return recoveryPromise;
}

async function getPermission() {
  const role = await OBR.player.getRole();
  if (role === "GM") return true;
  return OBR.player.hasPermission("CHARACTER_UPDATE");
}

async function performAction(request) {
  const requestId = request?.requestId;
  let leaseKey = null;
  let claimId = null;
  let marker = null;
  let transitionStarted = false;

  try {
    if (
      request?.type !== "perform" ||
      typeof requestId !== "string" || !requestId ||
      typeof request.tokenId !== "string" || !request.tokenId ||
      typeof request.actionId !== "string" || !request.actionId
    ) {
      await sendStatus(requestId, false, "O comando está incompleto. Atualize o painel e tente novamente.");
      return;
    }

    await recoveryPromise;
    if (!sceneReady || !(await OBR.scene.isReady())) {
      await sendStatus(requestId, false, "A cena ainda não está pronta.");
      return;
    }
    if (!(await getPermission())) {
      await sendStatus(requestId, false, "Você não tem permissão para atualizar tokens de personagem nesta sala.");
      return;
    }

    const firstToken = await getToken(request.tokenId);
    if (!firstToken) {
      await sendStatus(requestId, false, "O personagem vinculado não está mais na cena.");
      return;
    }
    const firstConfig = normalizeConfig(firstToken.metadata?.[CONFIG_KEY]);
    const firstRuntime = firstToken.metadata?.[RUNTIME_KEY] ?? { stateId: firstConfig.idleStateId };
    const action = firstConfig.actions.find((candidate) => candidate.id === request.actionId);
    if (!canStartAction({ token: firstToken, config: firstConfig, runtime: firstRuntime, action })) {
      await sendStatus(requestId, false, "Ação indisponível para o estado atual. Atualize o painel e tente novamente.");
      return;
    }

    claimId = crypto.randomUUID();
    const claim = { claimId, connectionId, createdAt: Date.now() };
    if (!(await winClaim(request.tokenId, claim))) {
      await sendStatus(requestId, false, "Outra ação foi iniciada para este personagem ao mesmo tempo.");
      return;
    }

    leaseKey = await acquireLease(request.tokenId, claimId);
    if (!leaseKey) {
      await sendStatus(requestId, false, "Outra ação está ocupando este personagem.");
      return;
    }

    const token = await getToken(request.tokenId);
    const config = normalizeConfig(token?.metadata?.[CONFIG_KEY]);
    const runtime = token?.metadata?.[RUNTIME_KEY] ?? { stateId: config.idleStateId };
    const currentAction = config.actions.find((candidate) => candidate.id === request.actionId);
    if (!token || !canStartAction({ token, config, runtime, action: currentAction })) {
      await sendStatus(requestId, false, "O estado do personagem mudou durante a execução. Tente novamente.");
      return;
    }

    const sourceStateId = getCurrentStateId(config, runtime);
    const destination = getState(config, currentAction.toStateId);
    if (!destination) {
      await sendStatus(requestId, false, "O estado final desta ação não existe mais.");
      return;
    }

    await OBR.scene.items.updateItems(
      (item) => item.id === token.id && isImage(item),
      (drafts) => {
        for (const item of drafts) {
          if (item.id !== token.id) continue;
          const liveConfig = normalizeConfig(item.metadata?.[CONFIG_KEY]);
          const liveRuntime = item.metadata?.[RUNTIME_KEY] ?? { stateId: liveConfig.idleStateId };
          const liveAction = liveConfig.actions.find((candidate) => candidate.id === request.actionId);
          if (!canStartAction({ token: item, config: liveConfig, runtime: liveRuntime, action: liveAction })) continue;
          const liveDestination = getState(liveConfig, liveAction.toStateId);
          if (!liveDestination) continue;
          marker = createTransitionMarker({
            tokenId: item.id,
            action: liveAction,
            sourceStateId: getCurrentStateId(liveConfig, liveRuntime),
            finalImage: liveDestination.image,
            // O relógio começa dentro da atualização que troca a imagem na cena.
            startedAt: Date.now(),
            leaseKey,
            leaseClaimId: claimId,
          });
          applyImageToItem(item, liveAction.transitionImage);
          item.metadata = {
            ...(item.metadata ?? {}),
            [TRANSITION_KEY]: marker,
          };
          transitionStarted = true;
        }
      }
    );

    if (!transitionStarted) {
      await sendStatus(requestId, false, "Não foi possível iniciar a pose transitória. O personagem pode ter mudado de estado.");
      return;
    }

    scheduleFinish(token.id, marker);
    await sendStatus(requestId, true, `${currentAction.name}: pose transitória por 4 segundos.`);
  } catch (error) {
    console.error("Token Dinâmico: falha ao executar ação", error);
    if (transitionStarted && marker) {
      scheduleFinish(request.tokenId, marker, true);
    } else if (leaseKey && claimId) {
      await releaseLease(leaseKey, claimId);
    }
    await sendStatus(requestId, false, "Ocorreu um erro ao iniciar a ação. Confira o console da extensão se persistir.");
  } finally {
    if (claimId) claims.delete(`${request.tokenId}:${claimId}`);
    if (leaseKey && claimId && !transitionStarted) await releaseLease(leaseKey, claimId);
  }
}

OBR.onReady(async () => {
  try {
    connectionId = await OBR.player.getConnectionId();
    sceneReady = await OBR.scene.isReady();

    OBR.broadcast.onMessage(REQUEST_CHANNEL, (event) => {
      if (event.data?.type === "perform") {
        void performAction(event.data).catch((error) => {
          console.error("Token Dinâmico: comando não tratado", error);
          void sendStatus(event.data?.requestId, false, "O serviço encontrou um erro inesperado.");
        });
      }
    });

    OBR.broadcast.onMessage(CLAIM_CHANNEL, (event) => {
      const data = event.data;
      if (data?.type !== "claim" || !data.tokenId || !data.claimId) return;
      claims.set(`${data.tokenId}:${data.claimId}`, { ...data, receivedAt: Date.now() });
    });

    OBR.scene.items.onChange((items) => {
      for (const item of items) {
        const marker = item?.metadata?.[TRANSITION_KEY];
        if (marker && isValidTransitionMarker(marker)) scheduleFinish(item.id, marker);
      }
    });

    OBR.scene.onReadyChange((ready) => {
      sceneReady = ready;
      if (ready) void startRecovery();
    });

    if (sceneReady) await startRecovery();
  } catch (error) {
    console.error("Token Dinâmico: falha ao inicializar o serviço", error);
  }
});

window.addEventListener("pagehide", () => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
});

window.addEventListener("pageshow", () => {
  if (sceneReady) void startRecovery();
});
