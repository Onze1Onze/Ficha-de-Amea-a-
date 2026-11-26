export const SHOT_DURATION_MS = 4000;
export const CLAIM_SETTLE_MS = 450;
export const LEASE_TTL_MS = 8000;

export function isUsableImage(item) {
  return Boolean(
    item &&
    item.type === "IMAGE" &&
    typeof item.id === "string" &&
    item.image &&
    typeof item.image.url === "string" &&
    item.image.url.length > 0
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
    isUsableImage(animation) &&
    animation.visible !== false &&
    animation.layer !== "MAP" &&
    animation.id !== character.id &&
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
  if (!isUsableImage(item) || !shot || !shot.shotId) return false;
  const marker = item.metadata?.[shot.markerKey];
  return Boolean(
    marker &&
    marker.shotId === shot.shotId &&
    item.image.url === shot.temporaryImage?.url &&
    item.image.mime === shot.temporaryImage?.mime
  );
}

export function hasShotMarker(item, shot) {
  return Boolean(
    item &&
    item.metadata?.[shot.markerKey]?.shotId === shot.shotId
  );
}
