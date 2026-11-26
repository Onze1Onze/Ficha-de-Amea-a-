import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const EXTENSION_ID = "com.onze1.sistema-ameaca";
const REQUEST_CHANNEL = `${EXTENSION_ID}/request`;
const EVENT_CHANNEL = `${EXTENSION_ID}/events`;

const characterSelect = document.querySelector("#character");
const targetSelect = document.querySelector("#target");
const animationSelect = document.querySelector("#animation");
const fireButton = document.querySelector("#fire");
const statusNode = document.querySelector("#status");
const animationHint = document.querySelector("#animation-hint");

let sceneItems = [];
let requestInFlight = false;
let unsubscribeItems = null;
let unsubscribeScene = null;
let unsubscribeEvents = null;
let refreshQueued = false;
const pendingRequests = new Map();

function setStatus(message, kind = "") {
  statusNode.textContent = message;
  statusNode.dataset.kind = kind;
}

function labelFor(item) {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  return name || `Sem nome · ${item.id.slice(0, 7)}`;
}

function fillSelect(select, items, placeholder, selectedId) {
  const fragment = document.createDocumentFragment();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  fragment.append(empty);

  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${labelFor(item)}${item.layer ? ` · ${item.layer.toLowerCase()}` : ""}`;
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  select.value = items.some((item) => item.id === selectedId) ? selectedId : "";
}

function getSelected(id) {
  return sceneItems.find((item) => item.id === id);
}

function updateButtonState() {
  const character = getSelected(characterSelect.value);
  const target = getSelected(targetSelect.value);
  const animation = getSelected(animationSelect.value);
  const ready = Boolean(character && target && animation && !requestInFlight);
  fireButton.disabled = !ready;
  animationHint.textContent = animation
    ? "Imagem selecionada para a troca temporária."
    : "Nenhum recurso selecionado. O disparo ficará bloqueado.";
}

async function refreshItems() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(async () => {
    refreshQueued = false;
    try {
      if (!(await OBR.scene.isReady())) {
        sceneItems = [];
        fillSelect(characterSelect, [], "Cena indisponível", "");
        fillSelect(targetSelect, [], "Cena indisponível", "");
        fillSelect(animationSelect, [], "Cena indisponível", "");
        updateButtonState();
        return;
      }

      const previous = {
        character: characterSelect.value,
        target: targetSelect.value,
        animation: animationSelect.value,
      };
      sceneItems = (await OBR.scene.items.getItems(isImage)).filter(
        (item) => item.image && typeof item.image.url === "string"
      );

      const characters = sceneItems.filter(
        (item) => item.layer === "CHARACTER" && item.visible !== false && !item.locked
      );
      const usableTokens = sceneItems.filter(
        (item) => item.visible !== false && item.layer !== "MAP"
      );
      const targets = usableTokens;
      const animations = usableTokens;

      fillSelect(characterSelect, characters, "Selecione um personagem…", previous.character);
      fillSelect(targetSelect, targets, "Selecione um alvo…", previous.target);
      fillSelect(animationSelect, animations, "Selecione uma imagem…", previous.animation);
      updateButtonState();
    } catch (error) {
      console.error("Sistema Ameaça: falha ao atualizar os tokens", error);
      setStatus("Não foi possível ler os tokens da cena.", "error");
    }
  });
}

function handleExtensionEvent(event) {
  const data = event.data;
  if (data?.type !== "status" || !data.requestId) return;
  const pending = pendingRequests.get(data.requestId);
  if (!pending) return;

  window.clearTimeout(pending.timeout);
  pendingRequests.delete(data.requestId);
  requestInFlight = false;
  updateButtonState();
  setStatus(
    data.message || (data.ok ? "Disparo executado." : "Não foi possível executar o disparo."),
    data.ok ? "success" : "error"
  );
}

fireButton.addEventListener("click", async () => {
  if (requestInFlight) return;

  const characterId = characterSelect.value;
  const targetId = targetSelect.value;
  const animationId = animationSelect.value;
  const character = getSelected(characterId);
  const target = getSelected(targetId);
  const animation = getSelected(animationId);

  if (!character || !target || !animation) {
    setStatus("Selecione personagem, alvo e imagem de animação.", "error");
    updateButtonState();
    return;
  }
  if (characterId === targetId) {
    setStatus("O personagem não pode ser o próprio alvo.", "error");
    return;
  }
  if (characterId === animationId || character.image.url === animation.image.url) {
    setStatus("Escolha uma imagem diferente da aparência atual.", "error");
    return;
  }

  requestInFlight = true;
  updateButtonState();
  setStatus("Iniciando disparo…");

  const requestId = crypto.randomUUID();
  const timeout = window.setTimeout(() => {
    pendingRequests.delete(requestId);
    requestInFlight = false;
    updateButtonState();
    setStatus("O serviço da extensão não respondeu. Reabra a extensão e tente novamente.", "error");
  }, 2200);
  pendingRequests.set(requestId, { timeout });

  try {
    await OBR.broadcast.sendMessage(
      REQUEST_CHANNEL,
      { type: "fire", requestId, characterId, targetId, animationId },
      { destination: "LOCAL" }
    );
  } catch (error) {
    console.error("Sistema Ameaça: falha ao enviar o disparo", error);
    window.clearTimeout(timeout);
    pendingRequests.delete(requestId);
    requestInFlight = false;
    updateButtonState();
    setStatus("Não foi possível enviar o comando ao serviço da extensão.", "error");
  }
});

function onSelectionChanged() {
  updateButtonState();
}

characterSelect.addEventListener("change", onSelectionChanged);
targetSelect.addEventListener("change", onSelectionChanged);
animationSelect.addEventListener("change", onSelectionChanged);

OBR.onReady(async () => {
  setStatus("Conectado.", "success");
  unsubscribeItems = OBR.scene.items.onChange(() => void refreshItems());
  unsubscribeScene = OBR.scene.onReadyChange(() => void refreshItems());
  unsubscribeEvents = OBR.broadcast.onMessage(EVENT_CHANNEL, handleExtensionEvent);
  await refreshItems();
});

window.addEventListener("pagehide", () => {
  unsubscribeItems?.();
  unsubscribeScene?.();
  unsubscribeEvents?.();
  for (const pending of pendingRequests.values()) window.clearTimeout(pending.timeout);
  pendingRequests.clear();
});
