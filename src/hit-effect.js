export const TARGET_HIT_EFFECT_SHADER = `
uniform vec2 size;
uniform float time;
uniform float startTime;

half4 main(float2 coord) {
  vec2 p = (coord / size) * 2.0 - 1.0;
  float radius = length(p);
  float elapsed = max(0.0, time - startTime);

  // A short red wash makes the token read as hit, while the ring sells the impact.
  float envelope = 1.0 - smoothstep(0.76, 1.0, elapsed);
  float pulse = 0.5 + 0.5 * abs(sin(elapsed * 25.0));
  float centerGlow = (1.0 - smoothstep(0.06, 0.92, radius)) * (0.22 + 0.20 * pulse) * envelope;

  float ringRadius = 0.07 + elapsed * 0.72;
  float ring = 1.0 - smoothstep(0.016, 0.052, abs(radius - ringRadius));
  float ringAlpha = ring * (1.0 - smoothstep(0.68, 0.96, elapsed)) * 0.88;

  float initialFlash = (1.0 - smoothstep(0.0, 0.13, elapsed))
    * (1.0 - smoothstep(0.14, 0.88, radius));
  float alpha = min(0.92, max(centerGlow, max(ringAlpha, initialFlash * 0.82)));

  half3 red = half3(0.94, 0.012, 0.025);
  half3 hotRed = half3(1.0, 0.48, 0.42);
  half3 color = mix(red, hotRed, half(initialFlash));
  return half4(color, half(alpha));
}
`;

export function buildTargetHitEffect(shot, buildEffect) {
  if (
    !shot ||
    typeof shot.targetId !== "string" ||
    !shot.targetId ||
    !Number.isFinite(shot.startedAt) ||
    shot.startedAt < 0
  ) {
    return null;
  }
  if (typeof buildEffect !== "function") {
    throw new TypeError("O SDK precisa fornecer buildEffect.");
  }

  return buildEffect()
    .effectType("ATTACHMENT")
    .sksl(TARGET_HIT_EFFECT_SHADER)
    .uniforms([{ name: "startTime", value: shot.startedAt / 1000 }])
    .locked(true)
    .disableHit(true)
    .layer("ATTACHMENT")
    .attachedTo(shot.targetId)
    .build();
}
