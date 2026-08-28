precision highp float;

uniform sampler2D u_base;
uniform sampler2D u_glow1;
uniform sampler2D u_glow2;
uniform sampler2D u_glow3;
uniform sampler2D u_glow4;
uniform sampler2D u_glow5;

uniform float u_glowStrength;
uniform int u_layersCount;
uniform bool u_breatheEnabled;
uniform float u_time;

varying vec2 v_uv;

void main() {
  vec3 base = texture2D(u_base, v_uv).rgb;

  vec3 glow = vec3(0.0);
  float t = u_time;

  float w1 = 1.0;
  float w2 = 0.7;
  float w3 = 0.5;
  float w4 = 0.35;
  float w5 = 0.25;

  if (u_layersCount >= 1) glow += texture2D(u_glow1, v_uv).rgb * w1;
  if (u_layersCount >= 2) glow += texture2D(u_glow2, v_uv).rgb * w2;
  if (u_layersCount >= 3) glow += texture2D(u_glow3, v_uv).rgb * w3;
  if (u_layersCount >= 4) glow += texture2D(u_glow4, v_uv).rgb * w4;
  if (u_layersCount >= 5) glow += texture2D(u_glow5, v_uv).rgb * w5;

  float breathe = u_breatheEnabled ? (0.85 + 0.15 * sin(t * 1.2)) : 1.0;
  glow *= u_glowStrength * breathe;

  vec3 finalColor = base + glow;

  gl_FragColor = vec4(finalColor, 1.0);
}
