import test from "node:test";
import assert from "node:assert/strict";
import { buildTargetHitEffect, TARGET_HIT_EFFECT_SHADER } from "../src/hit-effect.js";

const shot = { shotId: "hit-1", targetId: "target-7", startedAt: 12500 };

class FakeEffectBuilder {
  constructor() { this.options = {}; }
  effectType(value) { this.options.effectType = value; return this; }
  sksl(value) { this.options.sksl = value; return this; }
  uniforms(value) { this.options.uniforms = value; return this; }
  locked(value) { this.options.locked = value; return this; }
  disableHit(value) { this.options.disableHit = value; return this; }
  layer(value) { this.options.layer = value; return this; }
  attachedTo(value) { this.options.attachedTo = value; return this; }
  build() { return { id: "local-hit-effect", ...this.options }; }
}

test("cria um efeito ATTACHMENT local ligado ao ID exato do alvo", () => {
  const effect = buildTargetHitEffect(shot, () => new FakeEffectBuilder());
  assert.equal(effect.type, undefined);
  assert.equal(effect.effectType, "ATTACHMENT");
  assert.equal(effect.attachedTo, "target-7");
  assert.equal(effect.layer, "ATTACHMENT");
  assert.equal(effect.locked, true);
  assert.equal(effect.disableHit, true);
  assert.equal(effect.id, "local-hit-effect");
});

test("converte startedAt de milissegundos para segundos do uniforme do shader", () => {
  const effect = buildTargetHitEffect(shot, () => new FakeEffectBuilder());
  assert.deepEqual(effect.uniforms, [{ name: "startTime", value: 12.5 }]);
});

test("shader produz flash vermelho, pulsação e onda circular com alpha", () => {
  assert.match(TARGET_HIT_EFFECT_SHADER, /uniform float time;/);
  assert.match(TARGET_HIT_EFFECT_SHADER, /uniform float startTime;/);
  assert.match(TARGET_HIT_EFFECT_SHADER, /sin\(/);
  assert.match(TARGET_HIT_EFFECT_SHADER, /ringRadius/);
  assert.match(TARGET_HIT_EFFECT_SHADER, /half4\(color, half\(alpha\)\)/);
});

test("não cria efeito para alvo ausente ou cronograma inválido", () => {
  assert.equal(buildTargetHitEffect({ ...shot, targetId: "" }, () => new FakeEffectBuilder()), null);
  assert.equal(buildTargetHitEffect({ ...shot, startedAt: Number.NaN }, () => new FakeEffectBuilder()), null);
  assert.equal(buildTargetHitEffect(null, () => new FakeEffectBuilder()), null);
});

test("exige o builder do SDK quando a requisição é válida", () => {
  assert.throws(() => buildTargetHitEffect(shot, null), TypeError);
});
