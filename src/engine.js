export const TRANSITION_DURATION_MS = 4000;
export const EXTENSION_ID = "com.onze1.dynamic-token";
export const CONFIG_KEY = `${EXTENSION_ID}/config`;
export const RUNTIME_KEY = `${EXTENSION_ID}/runtime`;
export const TRANSITION_KEY = `${EXTENSION_ID}/active-transition`;
export const LEASE_PREFIX = `${EXTENSION_ID}/lease/`;

export function createTransitionSchedule(startedAt = Date.now()) {
  if (!Number.isFinite(startedAt) || startedAt < 0) {
    throw new RangeError("startedAt precisa ser um timestamp válido.");
  }
  return {
    startedAt,
    endsAt: startedAt + TRANSITION_DURATION_MS,
    durationMs: TRANSITION_DURATION_MS,
  };
}

export function normalizeImageAsset(asset) {
  const image = asset?.image ?? asset;
  if (!image || typeof image.url !== "string" || !image.url.trim()) return null;
  if (typeof image.mime !== "string" || !image.mime.trim()) return null;

  const normalized = {
    url: image.url,
    mime: image.mime,
  };
  if (Number.isFinite(image.width) && image.width > 0) normalized.width = image.width;
  if (Number.isFinite(image.height) && image.height > 0) normalized.height = image.height;
  return normalized;
}

export function isCharacterAsset(asset) {
  return Boolean(
    asset &&
    (asset.type === "CHARACTER" || asset.type === undefined) &&
    normalizeImageAsset(asset)
  );
}

export function normalizeConfig(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.states) || !Array.isArray(raw.actions)) {
    return { version: 1, idleStateId: null, states: [], actions: [] };
  }

  const states = raw.states.filter((state) =>
    state && typeof state.id === "string" && state.id &&
    typeof state.name === "string" && state.name.trim() &&
    normalizeImageAsset(state.image)
  ).map((state) => ({
    id: state.id,
    name: state.name.trim(),
    image: normalizeImageAsset(state.image),
  }));

  const stateIds = new Set(states.map((state) => state.id));
  const actions = raw.actions.filter((action) =>
    action && typeof action.id === "string" && action.id &&
    typeof action.name === "string" && action.name.trim() &&
    (action.fromStateId === "*" || stateIds.has(action.fromStateId)) &&
    stateIds.has(action.toStateId) &&
    (action.kind === "transition" || action.kind === "attack") &&
    normalizeImageAsset(action.transitionImage) &&
    (action.kind !== "attack" || action.fromStateId === action.toStateId)
  ).map((action) => ({
    id: action.id,
    name: action.name.trim(),
    fromStateId: action.fromStateId,
    toStateId: action.toStateId,
    transitionImage: normalizeImageAsset(action.transitionImage),
    kind: action.kind,
  }));

  const idleStateId = stateIds.has(raw.idleStateId) ? raw.idleStateId : (states[0]?.id ?? null);
  return { version: 1, idleStateId, states, actions };
}

export function getState(config, stateId) {
  return config?.states?.find((state) => state.id === stateId) ?? null;
}

export function getCurrentStateId(config, runtime) {
  const stateId = runtime?.stateId;
  return getState(config, stateId)?.id ?? config?.idleStateId ?? config?.states?.[0]?.id ?? null;
}

export function getAvailableActions(config, runtime, activeTransition = null) {
  if (activeTransition) return [];
  const currentStateId = getCurrentStateId(config, runtime);
  if (!currentStateId) return [];
  return (config?.actions ?? []).filter((action) =>
    action.fromStateId === "*" || action.fromStateId === currentStateId
  );
}

export function canStartAction({ token, config, runtime, action, activeTransition = null }) {
  if (!token || token.type !== "IMAGE" || token.layer !== "CHARACTER" || token.visible === false || token.locked) {
    return false;
  }
  if (activeTransition || token.metadata?.[TRANSITION_KEY]) return false;
  if (!action || !config?.actions?.some((candidate) => candidate.id === action.id)) return false;

  const currentStateId = getCurrentStateId(config, runtime);
  const currentState = getState(config, currentStateId);
  const finalState = getState(config, action.toStateId);
  const transitionImage = normalizeImageAsset(action.transitionImage);
  const currentImage = normalizeImageAsset(token.image);
  if (!currentState || !finalState || !transitionImage || !currentImage) return false;
  if (action.fromStateId !== "*" && action.fromStateId !== currentStateId) return false;
  if (currentImage.url !== currentState.image.url || currentImage.mime !== currentState.image.mime) return false;
  if (transitionImage.url === currentImage.url || transitionImage.url === finalState.image.url) return false;
  if (action.kind === "attack" && action.fromStateId !== action.toStateId) return false;
  return true;
}

export function isValidTransitionMarker(marker) {
  return Boolean(
    marker && typeof marker.id === "string" && marker.id &&
    typeof marker.tokenId === "string" && marker.tokenId &&
    typeof marker.actionId === "string" && marker.actionId &&
    typeof marker.fromStateId === "string" && marker.fromStateId &&
    typeof marker.toStateId === "string" && marker.toStateId &&
    Number.isFinite(marker.startedAt) &&
    Number.isFinite(marker.endsAt) &&
    marker.endsAt === marker.startedAt + TRANSITION_DURATION_MS &&
    normalizeImageAsset(marker.transitionImage) &&
    normalizeImageAsset(marker.finalImage)
  );
}

export function getRemainingMs(marker, now = Date.now()) {
  if (!isValidTransitionMarker(marker) || !Number.isFinite(now)) return 0;
  return Math.max(0, marker.endsAt - now);
}

export function isSameTransitionVisible(item, marker) {
  if (!item || !isValidTransitionMarker(marker)) return false;
  const stored = item.metadata?.[TRANSITION_KEY];
  const image = normalizeImageAsset(item.image);
  return Boolean(
    stored?.id === marker.id &&
    image &&
    image.url === marker.transitionImage.url &&
    image.mime === marker.transitionImage.mime
  );
}

export function compareClaims(a, b) {
  const timeA = Number.isFinite(a?.createdAt) ? a.createdAt : 0;
  const timeB = Number.isFinite(b?.createdAt) ? b.createdAt : 0;
  if (timeA !== timeB) return timeA - timeB;
  const connectionA = String(a?.connectionId ?? "");
  const connectionB = String(b?.connectionId ?? "");
  if (connectionA !== connectionB) return connectionA.localeCompare(connectionB);
  return String(a?.claimId ?? "").localeCompare(String(b?.claimId ?? ""));
}

export function applyImageToItem(item, asset) {
  const nextImage = normalizeImageAsset(asset);
  if (!item || !nextImage || !item.image) throw new TypeError("Imagem inválida para aplicar ao token.");

  const currentImage = normalizeImageAsset(item.image);
  const currentScale = item.scale;
  const currentExtent = currentImage?.height ?? currentImage?.width;
  const nextExtent = nextImage.height ?? nextImage.width;

  // Mantém a altura visual do token em imagens com resoluções diferentes.
  // O fator uniforme preserva a proporção da nova imagem.
  if (
    currentScale &&
    Number.isFinite(currentScale.x) &&
    Number.isFinite(currentScale.y) &&
    Number.isFinite(currentExtent) &&
    Number.isFinite(nextExtent) &&
    currentExtent > 0 &&
    nextExtent > 0
  ) {
    const factor = currentExtent / nextExtent;
    item.scale = {
      ...currentScale,
      x: currentScale.x * factor,
      y: currentScale.y * factor,
    };
  }

  item.image.url = nextImage.url;
  item.image.mime = nextImage.mime;
  if (Number.isFinite(nextImage.width)) item.image.width = nextImage.width;
  if (Number.isFinite(nextImage.height)) item.image.height = nextImage.height;
}

export function createTransitionMarker({ tokenId, action, sourceStateId, finalImage, startedAt, leaseKey, leaseClaimId }) {
  const schedule = createTransitionSchedule(startedAt);
  const transitionImage = normalizeImageAsset(action?.transitionImage);
  const normalizedFinal = normalizeImageAsset(finalImage);
  if (!tokenId || !action?.id || !sourceStateId || !transitionImage || !normalizedFinal) {
    throw new TypeError("Não foi possível construir a transição com os dados fornecidos.");
  }
  return {
    id: `${tokenId}:${action.id}:${startedAt}`,
    tokenId,
    actionId: action.id,
    fromStateId: sourceStateId,
    toStateId: action.toStateId,
    transitionImage,
    finalImage: normalizedFinal,
    startedAt: schedule.startedAt,
    endsAt: schedule.endsAt,
    durationMs: schedule.durationMs,
    leaseKey,
    leaseClaimId,
  };
}
