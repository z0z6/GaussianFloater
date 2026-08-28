precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rotationSpeed;
uniform vec3 u_color;
uniform int u_shapeType; // 0: image, 1: circle, 2: square, 3: star, 4: noise
uniform sampler2D u_image;
uniform bool u_useImage;

varying vec2 v_uv;

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
  float d = cos(5.0 * a + u_time * 0.2);
  float radius = 0.25 * (0.7 + 0.3 * d);
  return smoothstep(radius + 0.01, radius - 0.01, r);
}

float shapeNoise(vec2 uv) {
  float n = noise(uv * 6.0 + u_time * 0.1);
  return smoothstep(0.45, 0.55, n);
}

float getShape(vec2 uv) {
  if (u_shapeType == 1) return shapeCircle(uv);
  if (u_shapeType == 2) return shapeSquare(uv);
  if (u_shapeType == 3) return starShape(uv);
  if (u_shapeType == 4) return shapeNoise(uv);
  return 1.0; // dla image nie używamy tego
}

void main() {
  float angle = u_time * u_rotationSpeed;
  vec2 rotatedUV = rotateUV(v_uv, angle);

  vec3 color;

  if (u_useImage) {
    vec4 imgColor = texture2D(u_image, rotatedUV);
    color = imgColor.rgb * u_color;
  } else {
    float s = getShape(rotatedUV);
    color = u_color * s;
  }

  float vignette = smoothstep(0.9, 0.4, length(v_uv - 0.5));
  color *= 0.7 + 0.3 * vignette;

  gl_FragColor = vec4(color, 1.0);
}
