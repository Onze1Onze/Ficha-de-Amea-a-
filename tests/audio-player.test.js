import test from "node:test";
import assert from "node:assert/strict";
import { createAudioPlayer, playPreparedAudio } from "../src/audio-player.js";
import { hasMpegAudioFrame, validateMp3Buffer } from "../scripts/audio-validation.js";

class FakeAudio {
  constructor(url) { this.src = url; this.preload = "none"; this.currentTime = 3; this.volume = 0; this.loaded = 0; this.paused = 0; this.played = 0; }
  load() { this.loaded += 1; }
  pause() { this.paused += 1; }
  async play() { this.played += 1; }
}

test("cria o reprodutor com preload automático e inicia o carregamento uma única vez", () => {
  const audio = createAudioPlayer("/audio/bullet-casing-metal.mp3", FakeAudio);
  assert.equal(audio.src, "/audio/bullet-casing-metal.mp3");
  assert.equal(audio.preload, "auto");
  assert.equal(audio.loaded, 1);
});
test("rejeita URL vazia e construtor de áudio indisponível", () => {
  assert.throws(() => createAudioPlayer("", FakeAudio), TypeError);
  assert.throws(() => createAudioPlayer("/sound.mp3", null), TypeError);
});
test("reinicia o áudio e aplica volume antes de reproduzir", async () => {
  const audio = new FakeAudio("/sound.mp3");
  await playPreparedAudio(audio, 0.85);
  assert.equal(audio.paused, 1);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.volume, 0.85);
  assert.equal(audio.played, 1);
});
test("rejeita volume fora do intervalo permitido", async () => {
  const audio = new FakeAudio("/sound.mp3");
  await assert.rejects(playPreparedAudio(audio, -0.01), RangeError);
  await assert.rejects(playPreparedAudio(audio, 1.01), RangeError);
  assert.equal(audio.played, 0);
});
test("rejeita um reprodutor incompleto", async () => {
  await assert.rejects(playPreparedAudio(null), TypeError);
  await assert.rejects(playPreparedAudio({ play() {} }), TypeError);
});
test("propaga falhas reais de play() para o tratamento de erro do serviço", async () => {
  const failure = new Error("NotSupportedError");
  const audio = { currentTime: 5, volume: 0, pause() {}, async play() { throw failure; } };
  await assert.rejects(playPreparedAudio(audio), error => error === failure);
});
test("reconhece um quadro MPEG válido mesmo após uma etiqueta ID3", () => {
  const buffer = Buffer.alloc(4096);
  buffer.write("ID3", 0, "ascii");
  buffer[128] = 0xff; buffer[129] = 0xfb; buffer[130] = 0x90; buffer[131] = 0x64;
  assert.equal(hasMpegAudioFrame(buffer), true);
  assert.equal(validateMp3Buffer(buffer), true);
});
test("rejeita HTML de erro, dados truncados e buffers que não são MP3", () => {
  const html = Buffer.from("<html>404 not found</html>");
  const tooSmall = Buffer.alloc(100);
  const invalid = Buffer.alloc(4096, 0x41);
  assert.throws(() => validateMp3Buffer(html), RangeError);
  assert.throws(() => validateMp3Buffer(tooSmall), RangeError);
  assert.throws(() => validateMp3Buffer(invalid), TypeError);
});
