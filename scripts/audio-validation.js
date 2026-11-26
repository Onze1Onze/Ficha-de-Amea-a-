export function hasMpegAudioFrame(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  const limit = Math.min(buffer.length - 4, 64 * 1024);
  for (let index = 0; index <= limit; index += 1) {
    if (buffer[index] !== 0xff || (buffer[index + 1] & 0xe0) !== 0xe0) continue;
    const version = (buffer[index + 1] >> 3) & 0x03;
    const layer = (buffer[index + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[index + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[index + 2] >> 2) & 0x03;
    if (version !== 0x01 && layer !== 0x00 && bitrateIndex !== 0x00 && bitrateIndex !== 0x0f && sampleRateIndex !== 0x03) return true;
  }
  return false;
}

export function validateMp3Buffer(buffer, { minBytes = 1500, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("O áudio precisa ser um Buffer.");
  if (buffer.length < minBytes) throw new RangeError("O MP3 é pequeno demais ou está truncado.");
  if (buffer.length > maxBytes) throw new RangeError("O MP3 excede o limite de tamanho permitido.");
  if (!hasMpegAudioFrame(buffer)) throw new TypeError("O arquivo recebido não contém quadros MPEG Layer III válidos.");
  return true;
}
