import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMp3Buffer } from "./audio-validation.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = "https://sfxmint.com/dl/bullet-casing-06.mp3";
const destination = resolve(root, "audio/bullet-casing-metal.mp3");

async function main() {
  console.log("Baixando efeito CC0 do estojo: Steel Floor Bullet Casing 06");
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "audio/mpeg, application/octet-stream;q=0.9" },
  });
  if (!response.ok) throw new Error("SFXMint respondeu HTTP " + response.status + ".");

  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["audio/mpeg", "audio/mp3", "application/octet-stream", "binary/octet-stream"].includes(contentType)) {
    throw new TypeError("Tipo de conteúdo inesperado para o MP3: " + (contentType || "ausente"));
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  validateMp3Buffer(buffer);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  console.log("Áudio validado e preparado: " + destination);
  console.log("Tamanho: " + buffer.length + " bytes");
  console.log("SHA-256: " + sha256);
}

main().catch(error => {
  console.error("Falha ao preparar o áudio do estojo:", error);
  process.exitCode = 1;
});
