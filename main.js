import {
  initGL,
  createProgram,
  createBuffer,
  createTexture,
  createFramebuffer,
  setUniforms,
} from "./webgl-helpers.js";

const canvas = document.getElementById("glcanvas");
const gl = initGL(canvas);

// --- UI ---

const shapeTypeEl = document.getElementById("shapeType");
const rotationSpeedEl = document.getElementById("rotationSpeed");
const blurAmountEl = document.getElementById("blurAmount");
const glowStrengthEl = document.getElementById("glowStrength");
const colorREl = document.getElementById("colorR");
const colorGEl = document.getElementById("colorG");
const colorBEl = document.getElementById("colorB");
const layersCountEl = document.getElementById("layersCount");
const breatheEnabledEl = document.getElementById("breatheEnabled");
const exportBtn = document.getElementById("exportBtn");

function getParams() {
  const shapeMap = { circle: 0, square: 1, star: 2, noise: 3 };
  return {
    shapeType: shapeMap[shapeTypeEl.value],
    rotationSpeed: parseFloat(rotationSpeedEl.value),
    blurAmount: parseFloat(blurAmountEl.value),
    glowStrength: parseFloat(glowStrengthEl.value),
    color: [
      parseFloat(colorREl.value),
      parseFloat(colorGEl.value),
      parseFloat(colorBEl.value),
    ],
    layersCount: parseInt(layersCountEl.value, 10),
    breatheEnabled: breatheEnabledEl.checked,
  };
}

// --- Shader sources ---

const vsSource = await fetch("shader-vertex.glsl").then((r) => r.text());
const fsBaseSource = await fetch("shader-fragment-base.glsl").then((r) =>
  r.text()
);
const fsBlurSource = await fetch("shader-fragment-blur.glsl").then((r) =>
  r.text()
);
const fsComposeSource = await fetch("shader-fragment-compose.glsl").then(
  (r) => r.text()
);

// --- Programy ---

const programBase = createProgram(gl, vsSource, fsBaseSource);
const programBlur = createProgram(gl, vsSource, fsBlurSource);
const programCompose = createProgram(gl, vsSource, fsComposeSource);

// --- Buffer (quad) ---

const quadVerts = new Float32Array([
  // x, y,  u, v
  -1, -1,  0, 0,
   1, -1,  1, 0,
  -1,  1,  0, 1,
   1,  1,  1, 1,
]);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

const aPosition = gl.getAttribLocation(programBase, "a_position");
const aUv = gl.getAttribLocation(programBase, "a_uv");

gl.enableVertexAttribArray(aPosition);
gl.enableVertexAttribArray(aUv);
gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 8, 0);
gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 8, 4);

// --- Tekstury i framebuffery ---

let baseTex = null;
let baseFb = null;

const glowTex = [];
const glowFb = [];

// Pomocnicze tekstury do blurra (H/V)
let tempTex1 = null;
let tempFb1 = null;
let tempTex2 = null;
let tempFb2 = null;

function resizeResources() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);

  canvas.width = width;
  canvas.height = height;

  // Bazowa tekstura
  if (baseTex) gl.deleteTexture(baseTex);
  if (baseFb) gl.deleteFramebuffer(baseFb);
  baseTex = createTexture(gl, width, height);
  baseFb = createFramebuffer(gl, baseTex);

  // Glow tekstury
  for (let i = 0; i < 5; i++) {
    if (glowTex[i]) gl.deleteTexture(glowTex[i]);
    if (glowFb[i]) gl.deleteFramebuffer(glowFb[i]);
    glowTex[i] = createTexture(gl, width, height);
    glowFb[i] = createFramebuffer(gl, glowTex[i]);
  }

  // Temp tekstury do blurra
  if (tempTex1) gl.deleteTexture(tempTex1);
  if (tempFb1) gl.deleteFramebuffer(tempFb1);
  if (tempTex2) gl.deleteTexture(tempTex2);
  if (tempFb2) gl.deleteFramebuffer(tempFb2);

  tempTex1 = createTexture(gl, width, height);
  tempFb1 = createFramebuffer(gl, tempTex1);
  tempTex2 = createTexture(gl, width, height);
  tempFb2 = createFramebuffer(gl, tempTex2);
}

// --- Renderowanie bazowego kształtu ---

function renderBase(params) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, baseFb);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(programBase);

  setUniforms(gl, programBase, {
    u_resolution: [canvas.width, canvas.height],
    u_time: performance.now() / 1000,
    u_rotationSpeed: params.rotationSpeed,
    u_color: params.color,
    u_shapeType: params.shapeType,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// --- 2-pass blur ---

function renderBlurPass(inputTex, outputFb, sigma, horizontal) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, outputFb);
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(programBlur);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, inputTex);
  const uTexture = gl.getUniformLocation(programBlur, "u_texture");
  gl.uniform1i(uTexture, 0);

  setUniforms(gl, programBlur, {
    u_texel: [1.0 / canvas.width, 1.0 / canvas.height],
    u_sigma: sigma,
    u_horizontal: horizontal,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function renderGlowLayer(layerIndex, params) {
  // Każda warstwa glow = osobny 2-pass blur na bazie, z innym sigma
  const sigmaBase = params.blurAmount;
  const sigma = sigmaBase * (layerIndex + 1);

  // Pass 1: poziomy: baseTex -> tempTex1
  renderBlurPass(baseTex, tempFb1, sigma, true);
  // Pass 2: pionowy: tempTex1 -> glowTex[layerIndex]
  renderBlurPass(tempTex1, glowFb[layerIndex], sigma, false);
}

// --- Kompozycja końcowa ---

function renderCompose(params) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(programCompose);

  // Podpinamy tekstury
  const texNames = ["u_base", "u_glow1", "u_glow2", "u_glow3", "u_glow4", "u_glow5"];
  texNames.forEach((name, i) => {
    const loc = gl.getUniformLocation(programCompose, name);
    gl.activeTexture(gl.TEXTURE0 + i);
    if (i === 0) {
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
    } else if (i <= params.layersCount) {
      gl.bindTexture(gl.TEXTURE_2D, glowTex[i - 1]);
    } else {
      // nieużywane – podpinamy baseTex jako dummy
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
    }
    gl.uniform1i(loc, i);
  });

  setUniforms(gl, programCompose, {
    u_glowStrength: params.glowStrength,
    u_layersCount: params.layersCount,
    u_breatheEnabled: params.breatheEnabled,
    u_time: performance.now() / 1000,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// --- Pętla renderowania ---

let startTime = performance.now();

function render() {
  const now = performance.now();
  const time = (now - startTime) / 1000;

  const params = getParams();

  // 1. Render bazowy
  renderBase(params);

  // 2. Warstwy glow
  for (let i = 0; i < params.layersCount; i++) {
    renderGlowLayer(i, params);
  }

  // 3. Kompozycja
  renderCompose(params);

  requestAnimationFrame(render);
}

function resize() {
  resizeResources();
}

window.addEventListener("resize", resize);
resize();
render();

// --- Export PNG ---

exportBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "gaussian-floater.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
