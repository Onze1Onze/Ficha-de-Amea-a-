export function createAudioPlayer(url, AudioConstructor = globalThis.Audio) {
  if (typeof url !== "string" || !url.trim()) {
    throw new TypeError("A URL do áudio precisa ser uma string não vazia.");
  }
  if (typeof AudioConstructor !== "function") {
    throw new TypeError("O navegador não disponibilizou o construtor Audio.");
  }

  const audio = new AudioConstructor(url);
  audio.preload = "auto";
  audio.load();
  return audio;
}

export function waitForAudioReady(audio, timeoutMs = 5000) {
  if (!audio || typeof audio.addEventListener !== "function" || typeof audio.removeEventListener !== "function") {
    return Promise.reject(new TypeError("O reprodutor não oferece eventos de mídia."));
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new RangeError("O tempo limite precisa ser positivo."));
  }
  if (audio.error) return Promise.reject(new Error("O navegador informou uma falha ao carregar o áudio."));
  if (audio.readyState >= 3) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("error", onError);
    };
    const finish = (error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => {
      if (audio.readyState >= 3) finish();
    };
    const onError = () => finish(new Error("Não foi possível carregar o recurso de áudio."));
    
    audio.addEventListener("canplay", onReady);
    audio.addEventListener("error", onError);
    timer = setTimeout(() => finish(new Error("Tempo esgotado ao preparar o áudio.")), timeoutMs);

    // Evita perder um evento canplay ocorrido entre a checagem inicial e a inscrição.
    if (audio.readyState >= 3) finish();
    else if (audio.error) onError();
  });
}

export async function playPreparedAudio(audio, volume = 1) {
  if (!audio || typeof audio.play !== "function" || typeof audio.pause !== "function") {
    throw new TypeError("O reprodutor de áudio não é válido.");
  }
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError("O volume precisa estar entre 0 e 1.");
  }

  await waitForAudioReady(audio);
  audio.pause();
  audio.currentTime = 0;
  audio.volume = volume;
  await audio.play();
}
