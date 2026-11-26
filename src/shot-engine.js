export const SHOT_SOUND_DELAY_MS = 1000;
export const CASING_SOUND_DELAY_MS = 450;
export const SHOT_DURATION_MS = 4000;
export const SHOT_AFTER_SOUND_MS = SHOT_DURATION_MS - SHOT_SOUND_DELAY_MS;
export const CLAIM_SETTLE_MS = 450;
export const LEASE_TTL_MS = 8000;

export function createShotTiming(startedAt = Date.now()) {
  if (!Number.isFinite(startedAt) || startedAt < 0) {
    throw new RangeError("startedAt precisa ser um timestamp válido.");
  }

  return {
    startedAt,
    soundAt: startedAt + SHOT_SOUND_DELAY_MS,
    casingAt: startedAt + SHOT_SOUND_DELAY_MS + CASING_SOUND_DELAY_MS,
    restoreAt: startedAt + SHOT_DURATION_MS,
  };
}

export function getCasingSoundAt(shot) {
  if (!shot || !Number.isFinite(shot.soundAt)) return Number.NaN;
  return Number.isFinite(shot.casingAt)
    ? shot.casingAt
    : shot.soundAt + CASING_SOUND_DELAY_MS;
}

export function isValidShotSchedule(shot) {
  const casingAt = getCasingSoundAt(shot);
  return Boolean(
    shot &&
    typeof shot.shotId === "string" &&
    shot.shotId.length > 0 &&
    typeof shot.characterId === "string" &&
    shot.characterId.length > 0 &&
    typeof shot.markerKey === "string" &&
    shot.markerKey.length > 0 &&
    shot.temporaryImage &&
    typeof shot.temporaryImage.url === "string" &&
    shot.temporaryImage.url.length > 0 &&
    typeof shot.temporaryImage.mime === "string" &&
    shot.temporaryImage.mime.length > 0 &&
    Number.isFinite(shot.startedAt) &&
    Number.isFinite(shot.soundAt) &&
    Number.isFinite(shot.restoreAt) &&
    Number.isFinite(casingAt) &&
    shot.startedAt >= 0 &&
    shot.soundAt >= shot.startedAt &&
    casingAt >= shot.soundAt &&
    shot.restoreAt >= casingAt
  );
}

export function isUsableImage(item) {
  return Boolean(
    item &&
    item.type === "IMAGE" &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.image &&
    typeof item.image.url === "string" &&
    item.image.url.length > 0
  );
}

export function isUsableLibraryCharacter(asset) {
  return Boolean(
    asset &&
    asset.type === "CHARACTER" &&
    asset.image &&
    typeof asset.image.url === "string" &&
    asset.image.url.length > 0 &&
    typeof asset.image.mime === "string" &&
    asset.image.mime.length > 0
  );
}

export function canStartShot({ character, target, animation }) {
  return Boolean(
    isUsableImage(character) &&
    character.layer === "CHARACTER" &&
    character.visible !== false &&
    !character.locked &&
    isUsableImage(target) &&
    target.visible !== false &&
    target.layer !== "MAP" &&
    target.id !== character.id &&
    isUsableLibraryCharacter(animation) &&
    animation.image.url !== character.image.url
  );
}

export function compareClaims(a, b) {
  const timeA = Number.isFinite(a?.createdAt) ? a.createdAt : 0;
  const timeB = Number.isFinite(b?.createdAt) ? b.createdAt : 0;
  if (timeA !== timeB) return timeA - timeB;

  const ownerA = String(a?.connectionId ?? "");
  const ownerB = String(b?.connectionId ?? "");
  if (ownerA !== ownerB) return ownerA.localeCompare(ownerB);

  return String(a?.shotId ?? "").localeCompare(String(b?.shotId ?? ""));
}

export function canRestoreShot(item, shot) {
  if (!isUsableImage(item) || !isValidShotSchedule(shot)) return false;
  const marker = item.metadata?.[shot.markerKey];

  return Boolean(
    marker &&
    marker.shotId === shot.shotId &&
    item.image.url === shot.temporaryImage.url &&
    item.image.mime === shot.temporaryImage.mime
  );
}

export function hasShotMarker(item, shot) {
  return Boolean(
    item &&
    shot &&
    typeof shot.markerKey === "string" &&
    item.metadata?.[shot.markerKey]?.shotId === shot.shotId
  );
}

export function createShotFromMarker(item, markerKey, now = Date.now()) {
  if (!isUsableImage(item) || typeof markerKey !== "string" || !markerKey) return null;

  const marker = item.metadata?.[markerKey];
  if (!marker || typeof marker.shotId !== "string" || !marker.shotId) return null;

  const originalImage = marker.originalImage;
  const temporaryImage = marker.temporaryImage;
  if (
    !originalImage ||
    typeof originalImage.url !== "string" ||
    !originalImage.url ||
    typeof originalImage.mime !== "string" ||
    !originalImage.mime ||
    !temporaryImage ||
    typeof temporaryImage.url !== "string" ||
    !temporaryImage.url ||
    typeof temporaryImage.mime !== "string" ||
    !temporaryImage.mime ||
    !Number.isFinite(now) ||
    now < 0
  ) {
    return null;
  }

  const hasStartTime = Number.isFinite(marker.startedAt);
  const startedAt = hasStartTime ? marker.startedAt : now;
  const fallbackTiming = hasStartTime
    ? createShotTiming(startedAt)
    : { startedAt, soundAt: startedAt, casingAt: startedAt, restoreAt: startedAt };

  const soundAt = Number.isFinite(marker.soundAt) ? marker.soundAt : fallbackTiming.soundAt;
  const shot = {
    shotId: marker.shotId,
    characterId: item.id,
    markerKey,
    temporaryImage: { url: temporaryImage.url, mime: temporaryImage.mime },
    startedAt,
    soundAt,
    casingAt: Number.isFinite(marker.casingAt)
      ? marker.casingAt
      : (hasStartTime ? soundAt + CASING_SOUND_DELAY_MS : soundAt),
    restoreAt: Number.isFinite(marker.restoreAt) ? marker.restoreAt : fallbackTiming.restoreAt,
    connectionId: typeof marker.connectionId === "string" ? marker.connectionId : "",
  };

  return isValidShotSchedule(shot) ? shot : null;
}


export function shouldScheduleShotSound(shot, now = Date.now()) {
  return Boolean(
    isValidShotSchedule(shot) &&
    Number.isFinite(now) &&
    now >= 0 &&
    now < shot.soundAt
  );
}


export function shouldScheduleCasingSound(shot, now = Date.now()) {
  return Boolean(
    isValidShotSchedule(shot) &&
    Number.isFinite(now) &&
    now >= 0 &&
    now < getCasingSoundAt(shot)
  );
}
