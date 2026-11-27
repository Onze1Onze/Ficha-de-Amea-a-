import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  CONFIG_KEY,
  RUNTIME_KEY,
  TRANSITION_KEY,
  normalizeConfig,
  normalizeImageAsset,
  isCharacterAsset,
  getState,
  getCurrentStateId,
  getAvailableActions,
  canStartAction,
  applyImageToItem,
} from "./engine.js";

const ID = "com.onze1.dynamic-token";
const REQUEST_CHANNEL = `${ID}/request`;
const EVENTS_CHANNEL = `${ID}/events`;
const PLAYER_BINDING_KEY = `${ID}/bound-token-id`;

const $ = (selector) => document.querySelector(selector);
const connectionNode = $("#connection");
const targetNameNode = $("#target-name");
const targetLayerNode = $("#target-layer");
const targetDescriptionNode = $("#target-description");
const bindButton = $("#bind-selection");
const workspace = $("#workspace");
const currentStateNode = $("#current-state");
const activityNode = $("#activity");
const statusNode = $("#status");
const permissionNote = $("#permission-note");

const stateNameInput = $("#state-name");
const stateImageLabel = $("#state-image-label");
const transitionNameInput = $("#transition-name");
const transitionImageLabel = $("#transition-image-label");
const transitionFromSelect = $("#transition-from");
const transitionToSelect = $("#transition-to");
const attackNameInput = $("#attack-name");
const attackImageLabel = $("#attack-image-label");
const attackStateSelect = $("#attack-state");

let connected = false;
let isGM = false;
let canUpdateCharacters = false;
let boundTokenId = null;
let boundToken = null;
let config = normalizeConfig(null);
let runtime = null;
let stateImageDraft = null;
let transitionImageDraft = null;
let attackImageDraft = null;
let actionBusy = false;
let refreshing = false;
let refreshAgain = false;
const pendingRequests = new Map();

function setStatus(message, kind = "") {
  statusNode.textContent = message;
  statusNode.dataset.kind = kind;
}

function setConnection(state, label) {
  connectionNode.dataset.state = state;
  connectionNode.lastChild.textContent = ` ${label}`;
}

function option(label, value) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function fillSelect(select, entries, placeholder, selectedValue) {
  const fragment = document.createDocumentFragment();
  fragment.append(option(placeholder, ""));
  for (const entry of entries) fragment.append(option(entry.label, entry.value));
  select.replaceChildren(fragment);
  if (entries.some((entry) => entry.value === selectedValue)) select.value = selectedValue;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${className}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function stateName(stateId) {
  return getState(config, stateId)?.name ?? "Estado removido";
}

function currentStateId() {
  return getCurrentStateId(config, runtime);
}

function updateAdminControls() {
  for (const element of document.querySelectorAll(
    "#state-name, #choose-state-image, #save-state, #transition-name, #transition-from, #transition-to, #choose-transition-image, #save-transition, #attack-name, #attack-state, #choose-attack-image, #save-attack"
  )) {
    element.disabled = !isGM || !connected || Boolean(boundToken?.metadata?.[TRANSITION_KEY]);
  }
  permissionNote.classList.toggle("is-hidden", isGM);
  $("#save-state").disabled = !isGM || !connected || !stateImageDraft;
  $("#save-transition").disabled = !isGM || !connected || !transitionImageDraft;
  $("#save-attack").disabled = !isGM || !connected || !attackImageDraft;
}

function renderStates() {
  const list = $("#states-list");
  const states = config.states;
  $("#state-count").textContent = String(states.length);
  list.replaceChildren();
  if (!states.length) {
    list.className = "state-list empty-state";
    list.textContent = "Nenhum estado cadastrado. Adicione primeiro a imagem Idle.";
    return;
  }
  list.className = "state-list";

  for (const state of states) {
    const card = document.createElement("div");
    card.className = `state-card${state.id === currentStateId() ? " is-current" : ""}`;
    const main = document.createElement("div");
    main.className = "state-card-main";
    const title = document.createElement("strong");
    title.textContent = state.name;
    const detail = document.createElement("small");
    const labels = [];
    if (state.id === config.idleStateId) labels.push("Estado inicial");
    if (state.id === currentStateId()) labels.push("Estado atual");
    detail.textContent = labels.join(" · ");
    main.append(title, detail);

    const controls = document.createElement("div");
    controls.className = "card-controls";
    if (state.id !== config.idleStateId) {
      const setIdle = makeButton("DEFINIR IDLE", "button-secondary", () => void setState(state.id, true));
      setIdle.disabled = !isGM || Boolean(boundToken?.metadata?.[TRANSITION_KEY]);
      controls.append(setIdle);
    }
    if (state.id !== currentStateId()) {
      const useState = makeButton("USAR", "button-secondary", () => void setState(state.id, false));
      useState.disabled = !isGM || Boolean(boundToken?.metadata?.[TRANSITION_KEY]);
      controls.append(useState);
    }
    card.append(main, controls);
    list.append(card);
  }
}

function renderActionsList(listSelector, actions, kind) {
  const list = $(listSelector);
  list.replaceChildren();
  if (!actions.length) {
    list.className = "action-list empty-state";
    list.textContent = kind === "attack" ? "Nenhum ataque cadastrado." : "Nenhuma ação de transição cadastrada.";
    return;
  }
  list.className = "action-list";
  for (const action of actions) {
    const card = document.createElement("div");
    card.className = "action-card";
    const main = document.createElement("div");
    main.className = "action-card-main";
    const title = document.createElement("strong");
    title.textContent = action.name;
    const detail = document.createElement("small");
    const from = action.fromStateId === "*" ? "Qualquer estado" : stateName(action.fromStateId);
    const to = stateName(action.toStateId);
    detail.textContent = `${from} → ${to}`;
    main.append(title, detail);
    const remove = makeButton("REMOVER", "button-danger", () => void deleteAction(action.id));
    remove.disabled = !isGM || Boolean(boundToken?.metadata?.[TRANSITION_KEY]);
    card.append(main, remove);
    list.append(card);
  }
}

function renderAvailableActions() {
  const container = $("#available-actions");
  const eligibleActions = getAvailableActions(config, runtime, boundToken?.metadata?.[TRANSITION_KEY]);
  const currentActions = eligibleActions.filter((action) =>
    canStartAction({ token: boundToken, config, runtime, action })
  );
  $("#available-count").textContent = String(currentActions.length);
  container.replaceChildren();

  if (!config.states.length) {
    container.className = "available-actions empty-state";
    container.textContent = "Cadastre os estados do personagem para habilitar as ações.";
    return;
  }
  if (boundToken?.metadata?.[TRANSITION_KEY]) {
    container.className = "available-actions empty-state";
    container.textContent = "Ação em andamento. A pose final será aplicada ao completar os 4 segundos.";
    return;
  }
  if (!currentActions.length) {
    container.className = "available-actions empty-state";
    container.textContent = eligibleActions.length
      ? "Token fora do estado esperado ou indisponível."
      : "Nenhuma ação para este estado.";
    return;
  }

  container.className = "available-actions";
  for (const action of currentActions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "available-action";
    button.disabled = actionBusy || !canUpdateCharacters;
    const title = document.createElement("span");
    title.textContent = action.name;
    button.append(title);
    button.addEventListener("click", () => void performAction(action));
    container.append(button);
  }
}

function renderPanel() {
  if (!boundToken) {
    targetNameNode.textContent = "Nenhum token vinculado";
    targetLayerNode.textContent = "—";
    targetDescriptionNode.textContent = "Selecione exatamente um token de personagem na cena e vincule-o abaixo.";
    workspace.classList.add("is-hidden");
    updateAdminControls();
    return;
  }

  targetNameNode.textContent = boundToken.name || `Personagem ${boundToken.id.slice(0, 7)}`;
  targetLayerNode.textContent = boundToken.layer || "TOKEN";
  targetDescriptionNode.textContent = "Token vinculado.";
  workspace.classList.remove("is-hidden");

  const state = getState(config, currentStateId());
  currentStateNode.textContent = state?.name ?? "Ainda não configurado";
  const active = boundToken.metadata?.[TRANSITION_KEY];
  activityNode.textContent = active ? "EM AÇÃO" : "INATIVO";
  activityNode.dataset.active = active ? "true" : "false";
  updateAdminControls();
  renderStates();

  const transitions = config.actions.filter((action) => action.kind === "transition");
  const attacks = config.actions.filter((action) => action.kind === "attack");
  $("#transition-count").textContent = String(transitions.length);
  $("#attack-count").textContent = String(attacks.length);
  renderActionsList("#transitions-list", transitions, "transition");
  renderActionsList("#attacks-list", attacks, "attack");
  renderAvailableActions();

  const stateOptions = config.states.map((state) => ({ label: state.name, value: state.id }));
  const previousFrom = transitionFromSelect.value;
  const previousTo = transitionToSelect.value;
  const previousAttack = attackStateSelect.value;
  fillSelect(transitionFromSelect, [{ label: "Qualquer estado", value: "*" }, ...stateOptions], "Escolha a origem…", previousFrom || "*");
  fillSelect(transitionToSelect, stateOptions, "Escolha o estado final…", previousTo);
  fillSelect(attackStateSelect, stateOptions, "Escolha a arma / estado…", previousAttack);
}

async function readBoundToken() {
  if (!boundTokenId || !(await OBR.scene.isReady())) return null;
  const items = await OBR.scene.items.getItems((item) => item.id === boundTokenId && isImage(item));
  return items.find((item) => item.id === boundTokenId) ?? null;
}

async function refreshPanelOnce() {
  if (!connected) return;
  if (!boundTokenId) {
    boundToken = null;
    config = normalizeConfig(null);
    runtime = null;
    renderPanel();
    return;
  }
  try {
    boundToken = await readBoundToken();
    if (!boundToken) {
      targetNameNode.textContent = "Token não encontrado";
      targetDescriptionNode.textContent = "O token vinculado foi removido ou não está visível nesta cena. Vincule outro token.";
      workspace.classList.add("is-hidden");
      setStatus("O token vinculado não está mais na cena.", "error");
      return;
    }
    config = normalizeConfig(boundToken.metadata?.[CONFIG_KEY]);
    runtime = boundToken.metadata?.[RUNTIME_KEY] ?? { stateId: config.idleStateId };
    renderPanel();
  } catch (error) {
    console.error("Token Dinâmico: falha ao atualizar o token vinculado", error);
    setStatus("Não foi possível ler os dados do token. Tente novamente.", "error");
  }
}

async function refreshPanel() {
  refreshAgain = true;
  if (refreshing) return;
  refreshing = true;
  try {
    while (refreshAgain) {
      refreshAgain = false;
      await refreshPanelOnce();
    }
  } finally {
    refreshing = false;
  }
}

async function writeTokenData(mutator) {
  if (!isGM) throw new Error("Somente o Mestre pode configurar estados e ações.");
  if (!boundTokenId) throw new Error("Vincule um token antes de editar a configuração.");
  let changed = false;
  await OBR.scene.items.updateItems(
    (item) => item.id === boundTokenId && isImage(item),
    (drafts) => {
      for (const item of drafts) {
        if (item.id !== boundTokenId) continue;
        if (item.metadata?.[TRANSITION_KEY]) throw new Error("Aguarde a ação terminar.");
        const oldConfig = normalizeConfig(item.metadata?.[CONFIG_KEY]);
        const oldRuntime = item.metadata?.[RUNTIME_KEY] ?? { stateId: oldConfig.idleStateId };
        const result = mutator(item, oldConfig, oldRuntime);
        if (!result) continue;
        item.metadata = { ...(item.metadata ?? {}), [CONFIG_KEY]: result.config };
        if (result.runtime) item.metadata[RUNTIME_KEY] = result.runtime;
        changed = true;
      }
    }
  );
  if (!changed) throw new Error("O token mudou antes de salvar. Atualize o painel.");
  await refreshPanel();
}

async function bindSelectedToken() {
  try {
    const selectedIds = await OBR.player.getSelection();
    if (!Array.isArray(selectedIds) || selectedIds.length !== 1) {
      setStatus("Selecione exatamente um token de personagem na cena.", "error");
      return;
    }
    const selected = await OBR.scene.items.getItems((item) => item.id === selectedIds[0] && isImage(item));
    const token = selected.find((item) => item.id === selectedIds[0]);
    if (!token || token.layer !== "CHARACTER") {
      setStatus("O item selecionado não pertence à camada Personagens.", "error");
      return;
    }
    boundTokenId = token.id;
    await OBR.player.setMetadata({ [PLAYER_BINDING_KEY]: token.id });
    await refreshPanel();
    setStatus(`Token vinculado: ${token.name || token.id}.`, "success");
  } catch (error) {
    console.error("Token Dinâmico: falha ao vincular seleção", error);
    setStatus("Não foi possível vincular o token selecionado.", "error");
  }
}

async function chooseCharacterImage(labelNode, kind) {
  try {
    let downloads;
    try {
      downloads = await OBR.assets.downloadImages(false, undefined, "CHARACTER");
    } catch (error) {
      console.warn("Token Dinâmico: seletor filtrado indisponível; tentando a biblioteca geral", error);
      downloads = await OBR.assets.downloadImages(false);
    }
    if (!Array.isArray(downloads) || downloads.length === 0) {
      setStatus("Seleção cancelada. Nenhuma imagem foi alterada.");
      return null;
    }
    const asset = downloads.find(isCharacterAsset);
    if (!asset) {
      setStatus("Escolha uma imagem da categoria Personagens na biblioteca do Owlbear.", "error");
      return null;
    }
    const image = normalizeImageAsset(asset);
    const selected = {
      name: typeof asset.name === "string" && asset.name.trim() ? asset.name.trim() : "Imagem da biblioteca",
      image,
    };
    labelNode.textContent = selected.name;
    setStatus(`Imagem selecionada para ${kind.toLowerCase()}.`, "success");
    return selected;
  } catch (error) {
    console.error(`Token Dinâmico: falha ao selecionar imagem (${kind})`, error);
    setStatus("Não foi possível abrir a biblioteca de personagens.", "error");
    return null;
  }
}

async function addState() {
  const name = stateNameInput.value.trim();
  if (!name || !stateImageDraft) {
    setStatus("Informe o nome do estado e escolha sua imagem.", "error");
    return;
  }
  if (config.states.some((state) => state.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    setStatus("Já existe um estado com esse nome.", "error");
    return;
  }
  const state = { id: crypto.randomUUID(), name, image: stateImageDraft.image };
  try {
    await writeTokenData((item, oldConfig, oldRuntime) => {
      const next = { ...oldConfig, states: [...oldConfig.states, state] };
      let nextRuntime = oldRuntime;
      if (!oldConfig.idleStateId) {
        next.idleStateId = state.id;
        applyImageToItem(item, state.image);
        nextRuntime = { stateId: state.id, changedAt: Date.now() };
      }
      return { config: next, runtime: nextRuntime };
    });
    stateNameInput.value = "";
    stateImageDraft = null;
    stateImageLabel.textContent = "Nenhuma imagem escolhida";
    updateAdminControls();
    setStatus(`Estado “${name}” salvo.`, "success");
  } catch (error) {
    setStatus(error.message || "Não foi possível salvar o estado.", "error");
  }
}

async function setState(stateId, alsoIdle) {
  if (boundToken?.metadata?.[TRANSITION_KEY]) {
    setStatus("Aguarde a ação atual terminar antes de alterar o estado.", "error");
    return;
  }
  const state = getState(config, stateId);
  if (!state) return;
  try {
    await writeTokenData((item, oldConfig, oldRuntime) => {
      const destination = getState(oldConfig, stateId);
      if (!destination || item.metadata?.[TRANSITION_KEY]) return null;
      if (alsoIdle) oldConfig.idleStateId = stateId;
      applyImageToItem(item, destination.image);
      return {
        config: oldConfig,
        runtime: { ...oldRuntime, stateId, changedAt: Date.now() },
      };
    });
    setStatus(alsoIdle ? `“${state.name}” definido como Idle e aplicado.` : `Estado “${state.name}” aplicado.`, "success");
  } catch (error) {
    setStatus(error.message || "Não foi possível alterar o estado.", "error");
  }
}

async function addTransition() {
  const name = transitionNameInput.value.trim();
  const fromStateId = transitionFromSelect.value || "*";
  const toStateId = transitionToSelect.value;
  if (!name || !toStateId || !transitionImageDraft) {
    setStatus("Informe o nome, a origem, o estado final e a pose transitória.", "error");
    return;
  }
  const action = {
    id: crypto.randomUUID(),
    name,
    kind: "transition",
    fromStateId,
    toStateId,
    transitionImage: transitionImageDraft.image,
  };
  try {
    await writeTokenData((item, oldConfig) => {
      if (!getState(oldConfig, toStateId) || (fromStateId !== "*" && !getState(oldConfig, fromStateId))) return null;
      return { config: { ...oldConfig, actions: [...oldConfig.actions, action] } };
    });
    transitionNameInput.value = "";
    transitionImageDraft = null;
    transitionImageLabel.textContent = "Nenhuma imagem escolhida";
    updateAdminControls();
    setStatus(`Ação “${name}” salva.`, "success");
  } catch (error) {
    setStatus(error.message || "Não foi possível salvar a transição.", "error");
  }
}

async function addAttack() {
  const name = attackNameInput.value.trim();
  const stateId = attackStateSelect.value;
  if (!name || !stateId || !attackImageDraft) {
    setStatus("Informe o nome, o estado da arma e a pose de ataque.", "error");
    return;
  }
  const action = {
    id: crypto.randomUUID(),
    name,
    kind: "attack",
    fromStateId: stateId,
    toStateId: stateId,
    transitionImage: attackImageDraft.image,
  };
  try {
    await writeTokenData((item, oldConfig) => {
      if (!getState(oldConfig, stateId)) return null;
      return { config: { ...oldConfig, actions: [...oldConfig.actions, action] } };
    });
    attackNameInput.value = "";
    attackImageDraft = null;
    attackImageLabel.textContent = "Nenhuma imagem escolhida";
    updateAdminControls();
    setStatus(`Ataque “${name}” salvo.`, "success");
  } catch (error) {
    setStatus(error.message || "Não foi possível salvar o ataque.", "error");
  }
}

async function deleteAction(actionId) {
  if (!isGM || boundToken?.metadata?.[TRANSITION_KEY]) return;
  try {
    await writeTokenData((_item, oldConfig) => ({
      config: { ...oldConfig, actions: oldConfig.actions.filter((action) => action.id !== actionId) },
    }));
    setStatus("Ação removida.", "success");
  } catch (error) {
    setStatus(error.message || "Não foi possível remover a ação.", "error");
  }
}

async function performAction(action) {
  if (actionBusy || !boundTokenId || !canUpdateCharacters) return;
  if (boundToken?.metadata?.[TRANSITION_KEY]) {
    setStatus("Já existe uma ação em andamento neste personagem.", "error");
    return;
  }
  actionBusy = true;
  renderAvailableActions();
  const requestId = crypto.randomUUID();
  const timeout = window.setTimeout(() => {
    pendingRequests.delete(requestId);
    actionBusy = false;
    renderAvailableActions();
    setStatus("O serviço não respondeu. Verifique a conexão e tente novamente.", "error");
  }, 10000);
  pendingRequests.set(requestId, { timeout });
  setStatus(`Iniciando “${action.name}”…`);
  try {
    await OBR.broadcast.sendMessage(
      REQUEST_CHANNEL,
      { type: "perform", requestId, tokenId: boundTokenId, actionId: action.id },
      { destination: "LOCAL" }
    );
  } catch (error) {
    window.clearTimeout(timeout);
    pendingRequests.delete(requestId);
    actionBusy = false;
    renderAvailableActions();
    console.error("Token Dinâmico: falha ao enviar ação", error);
    setStatus("Não foi possível enviar a ação ao serviço.", "error");
  }
}

function handleServiceEvent(event) {
  const data = event.data;
  if (data?.type !== "status" || !data.requestId) return;
  const pending = pendingRequests.get(data.requestId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingRequests.delete(data.requestId);
  actionBusy = false;
  setStatus(data.message || (data.ok ? "Ação iniciada." : "A ação não pôde ser executada."), data.ok ? "success" : "error");
  void refreshPanel();
}

async function initialize() {
  try {
    connected = true;
    setConnection("ready", "conectado");
    isGM = (await OBR.player.getRole()) === "GM";
    canUpdateCharacters = isGM || await OBR.player.hasPermission("CHARACTER_UPDATE");
    const playerMetadata = await OBR.player.getMetadata();
    const savedBinding = playerMetadata?.[PLAYER_BINDING_KEY];
    if (typeof savedBinding === "string" && savedBinding) boundTokenId = savedBinding;
    updateAdminControls();

    OBR.broadcast.onMessage(EVENTS_CHANNEL, handleServiceEvent);
    OBR.scene.items.onChange((items) => {
      if (boundTokenId && items.some((item) => item.id === boundTokenId)) void refreshPanel();
    });
    OBR.scene.onReadyChange((ready) => {
      if (ready) void refreshPanel();
    });

    bindButton.addEventListener("click", () => void bindSelectedToken());
    $("#choose-state-image").addEventListener("click", async () => {
      stateImageDraft = await chooseCharacterImage(stateImageLabel, "estado");
      $("#save-state").disabled = !isGM || !stateImageDraft;
    });
    $("#choose-transition-image").addEventListener("click", async () => {
      transitionImageDraft = await chooseCharacterImage(transitionImageLabel, "transição");
      $("#save-transition").disabled = !isGM || !transitionImageDraft;
    });
    $("#choose-attack-image").addEventListener("click", async () => {
      attackImageDraft = await chooseCharacterImage(attackImageLabel, "ataque");
      $("#save-attack").disabled = !isGM || !attackImageDraft;
    });
    $("#save-state").addEventListener("click", () => void addState());
    $("#save-transition").addEventListener("click", () => void addTransition());
    $("#save-attack").addEventListener("click", () => void addAttack());

    await refreshPanel();
    setStatus("Conectado ao Owlbear Rodeo.", "success");
  } catch (error) {
    console.error("Token Dinâmico: falha ao inicializar o painel", error);
    setConnection("error", "erro de conexão");
    setStatus("Não foi possível iniciar a extensão. Feche e abra o painel novamente.", "error");
  }
}

OBR.onReady(() => void initialize());

window.addEventListener("pagehide", () => {
  for (const pending of pendingRequests.values()) clearTimeout(pending.timeout);
  pendingRequests.clear();
});
