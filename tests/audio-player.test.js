import test from "node:test";
import assert from "node:assert/strict";
import { createAudioPlayer, playPreparedAudio, waitForAudioReady } from "../src/audio-player.js";

class FakeAudio {
  constructor(url) {
    this.src = url;
    this.preload = "none";
    this.currentTime = 3;
    this.volume = 0;
    this.loaded = 0;
    this.paused = 0;
    this.played = 0;
    this.readyState = 4;
    this.error = null;
    this.listeners = new Map();
  }
  load() { this.loaded += 1; }
  pause() { this.paused += 1; }
  async play() { this.played += 1; }
  addEventListener(name, callback) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(callback);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name) { for (const callback of [...(this.listeners.get(name) ?? [])]) callback(); }
}

test("cria o reprodutor com preload automático e inicia o carregamento uma única vez", () => {
  const audio = createAudioPlayer("/audio/shotgun.mp3", FakeAudio);
  assert.equal(audio.src, "/audio/shotgun.mp3");
  assert.equal(audio.preload, "auto");
  assert.equal(audio.loaded, 1);
});
test("rejeita URL vazia e construtor de áudio indisponível", () => {
  assert.throws(() => createAudioPlayer("", FakeAudio), TypeError);
  assert.throws(() => createAudioPlayer("/sound.mp3", null), TypeError);
});
test("reconhece imediatamente um arquivo que já tem dados suficientes para tocar", async () => {
  await waitForAudioReady(new FakeAudio("/sound.mp3"));
});
test("aguarda canplay antes de liberar a reprodução", async () => {
  const audio = new FakeAudio("/sound.mp3");
  audio.readyState = 0;
  const ready = waitForAudioReady(audio, 100);
  audio.readyState = 3;
  audio.emit("canplay");
  await ready;
  assert.equal(audio.listeners.get("canplay")?.size ?? 0, 0);
});
test("rejeita erro de rede/mídia e timeout de carregamento", async () => {
  const failed = new FakeAudio("/broken.mp3");
  failed.readyState = 0;
  const failedPromise = waitForAudioReady(failed, 100);
  failed.emit("error");
  await assert.rejects(failedPromise, /carregar o recurso/);

  const slow = new FakeAudio("/slow.mp3");
  slow.readyState = 0;
  await assert.rejects(waitForAudioReady(slow, 5), /Tempo esgotado/);
});
test("reinicia o áudio e aplica volume depois de o arquivo estar pronto", async () => {
  const audio = new FakeAudio("/sound.mp3");
  await playPreparedAudio(audio, 0.85);
  assert.equal(audio.paused, 1);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.volume, 0.85);
  assert.equal(audio.played, 1);
});
test("rejeita volume fora do intervalo permitido e reprodutor incompleto", async () => {
  const audio = new FakeAudio("/sound.mp3");
  await assert.rejects(playPreparedAudio(audio, -0.01), RangeError);
  await assert.rejects(playPreparedAudio(audio, 1.01), RangeError);
  await assert.rejects(playPreparedAudio(null), TypeError);
  assert.equal(audio.played, 0);
});
test("propaga falhas reais de play() para o tratamento de erro do serviço", async () => {
  const failure = new Error("NotSupportedError");
  const audio = new FakeAudio("/broken.mp3");
  audio.play = async () => { throw failure; };
  await assert.rejects(playPreparedAudio(audio), error => error === failure);
});
