precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texel;
uniform float u_sigma;
uniform bool u_horizontal;

varying vec2 v_uv;

float gaussian(float x, float sigma) {
  return exp(-(x * x) / (2.0 * sigma * sigma));
}

void main() {
  const int samples = 7;
  const float radius = 3.0;

  vec3 color = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = -samples; i <= samples; i++) {
    float x = float(i) / float(samples);
    float w = gaussian(x * radius, u_sigma);

    vec2 offset = u_horizontal
      ? vec2(x * u_texel.x, 0.0)
      : vec2(0.0, x * u_texel.y);

    color += w * texture2D(u_texture, v_uv + offset).rgb;
    totalWeight += w;
  }

  gl_FragColor = vec4(color / totalWeight, 1.0);
}
