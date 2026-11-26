function updateButtonState() {
  const character = getSelected(characterSelect.value);
  fireButton.disabled = !Boolean(
    character && selectedAnimation && !requestInFlight && !libraryPickerInFlight
  );
  chooseAnimationButton.disabled = requestInFlight || libraryPickerInFlight;

  if (!selectedAnimation) {
    animationHint.textContent = "Nenhum token selecionado. Escolha um recurso da biblioteca de personagens.";
  } else {
    animationHint.textContent = "Biblioteca de personagens: " + selectedAnimation.name;
  }
}

import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { isUsableLibraryCharacter } from "./shot-engine.js";

const EXTENSION_ID = "com.onze1.sistema-ameaca";
const REQUEST_CHANNEL = EXTENSION_ID + "/request";
const EVENT_CHANNEL = EXTENSION_ID + "/events";

const characterSelect = document.querySelector("#character");
const chooseAnimationButton = document.querySelector("#choose-animation");
const fireButton = document.querySelector("#fire");
const statusNode = document.querySelector("#status");
const animationHint = document.querySelector("#animation-hint");

let sceneItems = [];
let selectedAnimation = null;
let requestInFlight = false;
let libraryPickerInFlight = false;
let refreshInFlight = false;
let refreshAgain = false;
let unsubscribeItems = null;
let unsubscribeScene = null;
let unsubscribeEvents = null;
const pendingRequests = new Map();

function setStatus(message, kind = "") {
  statusNode.textContent = message;
  statusNode.dataset.kind = kind;
}

function labelFor(item) {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  return name || "Sem nome · " + String(item.id).slice(0, 7);
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
    option.textContent = labelFor(item) + (item.layer ? " · " + item.layer.toLowerCase() : "");
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  select.value = items.some((item) => item.id === selectedId) ? selectedId : "";
}

function getSelected(id) {
  return sceneItems.find((item) => item.id === id);
}

async function refreshItemsOnce() {
  try {
    if (!(await OBR.scene.isReady())) {
      sceneItems = [];
      fillSelect(characterSelect, [], "Cena indisponível", "");
      updateButtonState();
      return;
    }

    const previous = {
      character: characterSelect.value,
    };
    const nextItems = await OBR.scene.items.getItems(isImage);
    sceneItems = nextItems.filter(
      (item) => item.image && typeof item.image.url === "string" && item.image.url.length > 0
    );

    const characters = sceneItems.filter(
      (item) => item.layer === "CHARACTER" && item.visible !== false && !item.locked
    );


    fillSelect(characterSelect, characters, "Selecione um personagem…", previous.character);
    updateButtonState();
  } catch (error) {
    console.error("Sistema Ameaça: falha ao atualizar os tokens", error);
    sceneItems = [];
    fillSelect(characterSelect, [], "Não foi possível carregar", "");
    updateButtonState();
    setStatus("Não foi possível ler os tokens da cena. Tente novamente.", "error");
  }
}

async function refreshItems() {
  refreshAgain = true;
  if (refreshInFlight) return;

  refreshInFlight = true;
  try {
    while (refreshAgain) {
      refreshAgain = false;
      await refreshItemsOnce();
    }
  } finally {
    refreshInFlight = false;
  }
}

function getErrorDetails(error) {
  if (error instanceof Error) {
    return error.name + ": " + (error.message || "sem mensagem");
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) || "erro desconhecido";
  } catch {
    return String(error);
  }
}

async function chooseLibraryAnimation() {
  if (requestInFlight || libraryPickerInFlight) return;

  if (!OBR.isReady || !OBR.assets || typeof OBR.assets.downloadImages !== "function") {
    setStatus("O SDK do Owlbear não disponibilizou a biblioteca de imagens. Feche e reabra a extensão.", "error");
    return;
  }

  libraryPickerInFlight = true;
  updateButtonState();
  setStatus("Abrindo biblioteca de personagens…");

  try {
    let downloads;

    try {
      downloads = await OBR.assets.downloadImages(false, undefined, "CHARACTER");
    } catch (filteredError) {
      console.warn("Sistema Ameaça: seletor com filtro CHARACTER falhou; tentando sem filtro.", filteredError);
      downloads = await OBR.assets.downloadImages(false);
    }

    if (!Array.isArray(downloads)) {
      throw new TypeError("O seletor do Owlbear não retornou uma lista de imagens.");
    }

    if (downloads.length === 0) {
      setStatus("Seleção cancelada. A aparência escolhida anteriormente foi mantida.");
      return;
    }

    const asset = downloads.find(isUsableLibraryCharacter);
    if (!asset) {
      setStatus("O item escolhido não é um token válido da categoria Personagens. Abra essa aba e tente novamente.", "error");
      return;
    }

    selectedAnimation = {
      name: typeof asset.name === "string" && asset.name.trim()
        ? asset.name.trim()
        : "Token da biblioteca",
      type: asset.type,
      image: {
        url: asset.image.url,
        mime: asset.image.mime,
      },
    };

    setStatus("Token da biblioteca selecionado.", "success");
  } catch (error) {
    const details = getErrorDetails(error);
    console.error("Sistema Ameaça: falha ao selecionar recurso da biblioteca:", error);
    setStatus("Falha ao abrir a biblioteca: " + details, "error");
  } finally {
    libraryPickerInFlight = false;
    updateButtonState();
  }
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
    data.message || (data.ok ? "Disparo iniciado." : "Não foi possível executar o disparo."),
    data.ok ? "success" : "error"
  );
}

fireButton.addEventListener("click", async () => {
  if (requestInFlight || libraryPickerInFlight) return;

  const characterId = characterSelect.value;
  const character = getSelected(characterId);
  const animation = selectedAnimation;

  if (!character || !animation) {
    setStatus("Selecione um personagem e um token da biblioteca.", "error");
    updateButtonState();
    return;
  }
  if (character.image.url === animation.image.url) {
    setStatus("Escolha um token da biblioteca com imagem diferente da aparência atual.", "error");
    return;
  }

  requestInFlight = true;
  updateButtonState();
  setStatus("Trocando a aparência do personagem…");

  const requestId = crypto.randomUUID();
  const timeout = window.setTimeout(() => {
    pendingRequests.delete(requestId);
    requestInFlight = false;
    updateButtonState();
    setStatus("O serviço da extensão não respondeu. Verifique a conexão e tente novamente.", "error");
  }, 8000);
  pendingRequests.set(requestId, { timeout });

  try {
    await OBR.broadcast.sendMessage(
      REQUEST_CHANNEL,
      { type: "fire", requestId, characterId, animation },
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

chooseAnimationButton.addEventListener("click", () => void chooseLibraryAnimation());
characterSelect.addEventListener("change", updateButtonState);

OBR.onReady(async () => {
  try {
    setStatus("Conectado.", "success");
    unsubscribeItems = OBR.scene.items.onChange(() => void refreshItems());
    unsubscribeScene = OBR.scene.onReadyChange(() => void refreshItems());
    unsubscribeEvents = OBR.broadcast.onMessage(EVENT_CHANNEL, handleExtensionEvent);
    await refreshItems();
  } catch (error) {
    console.error("Sistema Ameaça: não foi possível inicializar o painel", error);
    setStatus("Não foi possível inicializar a extensão. Reabra o painel.", "error");
  }
});

window.addEventListener("pagehide", () => {
  unsubscribeItems?.();
  unsubscribeScene?.();
  unsubscribeEvents?.();
  for (const pending of pendingRequests.values()) window.clearTimeout(pending.timeout);
  pendingRequests.clear();
});
