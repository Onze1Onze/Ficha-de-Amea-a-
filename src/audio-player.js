export function createAudioPlayer(url, AudioConstructor = globalThis.Audio) {
  if (typeof url !== "string" || !url.trim()) throw new TypeError("A URL do áudio precisa ser uma string não vazia.");
  if (typeof AudioConstructor !== "function") throw new TypeError("O navegador não disponibilizou o construtor Audio.");
  const audio = new AudioConstructor(url);
  audio.preload = "auto";
  audio.load();
  return audio;
}

export async function playPreparedAudio(audio, volume = 1) {
  if (!audio || typeof audio.play !== "function" || typeof audio.pause !== "function") {
    throw new TypeError("O reprodutor de áudio não é válido.");
  }
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError("O volume precisa estar entre 0 e 1.");
  }
  audio.pause();
  audio.currentTime = 0;
  audio.volume = volume;
  await audio.play();
}
