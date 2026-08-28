precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rotationSpeed;
uniform float u_blurAmount;
uniform float u_glowStrength;
uniform vec3 u_color;
uniform int u_layersCount;
uniform int u_shapeType; // 0: circle, 1: square, 2: star, 3: noise
uniform bool u_breatheEnabled;

// --- Narzędzia ---

vec2 rotateUV(vec2 uv, float angle) {
  vec2 center = vec2(0.5);
  vec2 p = uv - center;
  float s = sin(angle);
  float c = cos(angle);
  mat2 rot = mat2(c, -s, s, c);
  return center + rot * p;
}

float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Kształty

float shapeCircle(vec2 uv) {
  float d = length(uv - 0.5);
  return smoothstep(0.26, 0.24, d);
}

float shapeSquare(vec2 uv) {
  vec2 d = abs(uv - 0.5);
  float edge = max(d.x, d.y);
  return smoothstep(0.26, 0.24, edge);
}

float starShape(vec2 uv) {
  vec2 p = uv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x);
  // 5-ramienna gwiazda
  float d = cos(5.0 * a + u_time * 0.2);
  float radius = 0.25 * (0.7 + 0.3 * d);
  return smoothstep(radius + 0.01, radius - 0.01, r);
}

float shapeNoise(vec2 uv) {
  float n = noise(uv * 6.0 + u_time * 0.1);
  return smoothstep(0.45, 0.55, n);
}

float getShape(vec2 uv) {
  if (u_shapeType == 0) return shapeCircle(uv);
  if (u_shapeType == 1) return shapeSquare(uv);
  if (u_shapeType == 2) return starShape(uv);
  return shapeNoise(uv);
}

// Gaussian blur (uproszczony, w jednym fragmencie – dla demo)
float gaussian(float x, float sigma) {
  return exp(-(x * x) / (2.0 * sigma * sigma));
}

vec3 blurPass(vec2 uv, vec2 texel, float sigma, bool horizontal) {
  const int samples = 5;
  const float radius = 2.5;

  vec3 color = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = -samples; i <= samples; i++) {
    float x = float(i) / float(samples);
    float w = gaussian(x * radius, sigma);
    vec2 offset = horizontal
      ? vec2(x * texel.x, 0.0)
      : vec2(0.0, x * texel.y);

    // Zamiast texture2D, używamy bezpośrednio kształtu – to demo
    vec2 sampleUV = uv + offset;
    float s = getShape(sampleUV);
    color += w * u_color * s;
    totalWeight += w;
  }

  return color / totalWeight;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float angle = u_time * u_rotationSpeed;
  vec2 rotatedUV = rotateUV(uv, angle);

  float baseShape = getShape(rotatedUV);
  vec3 baseColor = u_color * baseShape;

  // Delikatne pogrubienie krawędzi
  float edge = 0.0;
  {
    // przybliżona pochodna kształtu
    float s1 = getShape(rotatedUV + vec2(0.005, 0.0));
    float s2 = getShape(rotatedUV + vec2(0.0, 0.005));
    edge = max(abs(s1 - baseShape), abs(s2 - baseShape));
  }

  vec3 floater = baseColor + edge * 0.4;

  // Warstwy glow
  float sigmaBase = u_blurAmount;
  vec3 glow = vec3(0.0);

  for (int i = 1; i <= 5; i++) {
    if (i > u_layersCount) break;
    float sigma = sigmaBase * float(i);
    vec3 layer = blurPass(uv, 1.0 / u_resolution, sigma, true);
    // drugi pass (pionowy) pominięty dla uproszczenia demo
    glow += layer * (1.0 / float(i));
  }

  glow *= u_glowStrength;

  float breathe = u_breatheEnabled ? (0.85 + 0.15 * sin(u_time * 1.2)) : 1.0;
  glow *= breathe;

  vec3 finalColor = floater + glow;

  // Delikatne wygaszanie na brzegach canvasu
  float vignette = smoothstep(0.9, 0.4, length(uv - 0.5));
  finalColor *= 0.6 + 0.4 * vignette;

  gl_FragColor = vec4(finalColor, 1.0);
}
