import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const EXTENSION_ID = "com.onze1.sistema-ameaca";
const REQUEST_CHANNEL = EXTENSION_ID + "/request";
const EVENT_CHANNEL = EXTENSION_ID + "/events";

const characterSelect = document.querySelector("#character");
const targetSelect = document.querySelector("#target");
const chooseAnimationButton = document.querySelector("#choose-animation");
const fireButton = document.querySelector("#fire");
const statusNode = document.querySelector("#status");
const animationHint = document.querySelector("#animation-hint");

let sceneItems = [];
let selectedAnimation = null;
let requestInFlight = false;
let libraryPickerInFlight = false;
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

function updateButtonState() {
  const character = getSelected(characterSelect.value);
  const target = getSelected(targetSelect.value);
  fireButton.disabled = !Boolean(character && target && selectedAnimation && !requestInFlight);
  chooseAnimationButton.disabled = requestInFlight || libraryPickerInFlight;

  if (!selectedAnimation) {
    animationHint.textContent = "Nenhum token selecionado. Escolha um recurso da biblioteca de personagens.";
  } else {
    animationHint.textContent = "Biblioteca de personagens: " + selectedAnimation.name;
  }
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
        updateButtonState();
        return;
      }

      const previous = {
        character: characterSelect.value,
        target: targetSelect.value,
      };
      sceneItems = (await OBR.scene.items.getItems(isImage)).filter(
        (item) => item.image && typeof item.image.url === "string"
      );

      const characters = sceneItems.filter(
        (item) => item.layer === "CHARACTER" && item.visible !== false && !item.locked
      );
      const targets = sceneItems.filter(
        (item) => item.visible !== false && item.layer !== "MAP"
      );

      fillSelect(characterSelect, characters, "Selecione um personagem…", previous.character);
      fillSelect(targetSelect, targets, "Selecione um alvo…", previous.target);
      updateButtonState();
    } catch (error) {
      console.error("Sistema Ameaça: falha ao atualizar os tokens", error);
      setStatus("Não foi possível ler os tokens da cena.", "error");
    }
  });
}

function getErrorDetails(error) {
  if (error instanceof Error) {
    return error.name + ": " + (error.message || "sem mensagem");
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function chooseLibraryAnimation() {
  if (requestInFlight || libraryPickerInFlight) return;

  if (!OBR.isReady || !OBR.assets || typeof OBR.assets.downloadImages !== "function") {
    setStatus("O SDK do Owlbear não disponibilizou o seletor de imagens. Feche e reabra a extensão.", "error");
    return;
  }

  libraryPickerInFlight = true;
  updateButtonState();
  setStatus("Abrindo biblioteca de personagens…");

  try {
    let downloads;

    try {
      // O filtro CHARACTER abre diretamente na categoria de personagens.
      // O segundo argumento é omitido deliberadamente: não há busca inicial.
      downloads = await OBR.assets.downloadImages(false, undefined, "CHARACTER");
    } catch (filteredError) {
      console.warn("Sistema Ameaça: seletor com filtro CHARACTER falhou; tentando sem filtro.", filteredError);
      // Alguns ambientes/versões do Owlbear podem não aplicar o typeHint.
      // A seleção ainda é validada como CHARACTER antes de ser aceita.
      downloads = await OBR.assets.downloadImages(false);
    }

    if (!Array.isArray(downloads)) {
      throw new TypeError("O seletor do Owlbear não retornou uma lista de imagens.");
    }

    if (downloads.length === 0) {
      setStatus("Nenhum token selecionado. A biblioteca continua disponível para uma nova tentativa.");
      return;
    }

    const asset = downloads.find((candidate) =>
      candidate &&
      candidate.type === "CHARACTER" &&
      candidate.image &&
      typeof candidate.image.url === "string" &&
      candidate.image.url.length > 0 &&
      typeof candidate.image.mime === "string" &&
      candidate.image.mime.length > 0
    );

    if (!asset) {
      setStatus("O item escolhido não é um token válido da categoria Personagens. Abra a aba Personagens e tente novamente.", "error");
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
  if (requestInFlight) return;

  const characterId = characterSelect.value;
  const targetId = targetSelect.value;
  const character = getSelected(characterId);
  const target = getSelected(targetId);
  const animation = selectedAnimation;

  if (!character || !target || !animation) {
    setStatus("Selecione personagem, alvo e um token da biblioteca.", "error");
    updateButtonState();
    return;
  }
  if (characterId === targetId) {
    setStatus("O personagem não pode ser o próprio alvo.", "error");
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
    setStatus("O serviço da extensão não respondeu. Reabra a extensão e tente novamente.", "error");
  }, 4000);
  pendingRequests.set(requestId, { timeout });

  try {
    await OBR.broadcast.sendMessage(
      REQUEST_CHANNEL,
      { type: "fire", requestId, characterId, targetId, animation },
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
targetSelect.addEventListener("change", updateButtonState);

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