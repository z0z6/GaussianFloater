import {
  initGL,
  createProgram,
  createBuffer,
  createTexture,
  createFramebuffer,
  createTextureFromImage,
  setUniforms,
} from "./webgl-helpers.js";

const canvas = document.getElementById("glcanvas");
const gl = initGL(canvas);

// --- UI ---
const loadImageBtn = document.getElementById("loadImageBtn");
const saveProcessedBtn = document.getElementById("saveProcessedBtn");
const imageFileInput = document.getElementById("imageFileInput");

const blurAmountEl = document.getElementById("blurAmount");
const glowStrengthEl = document.getElementById("glowStrength");
const colorREl = document.getElementById("colorR");
const colorGEl = document.getElementById("colorG");
const colorBEl = document.getElementById("colorB");
const layersCountEl = document.getElementById("layersCount");
const breatheEnabledEl = document.getElementById("breatheEnabled");

// --- Stan ---
let imageTex = null;
let imageWidth = 0;
let imageHeight = 0;

let fullresBaseTex = null;
let fullresBaseFb = null;
const fullresGlowTex = [];
const fullresGlowFb = [];
let fullresTempTex1 = null;
let fullresTempFb1 = null;
let fullresTempTex2 = null;
let fullresTempFb2 = null;

let previewBaseTex = null;
let previewBaseFb = null;
const previewGlowTex = [];
const previewGlowFb = [];
let previewTempTex1 = null;
let previewTempFb1 = null;
let previewTempTex2 = null;
let previewTempFb2 = null;

function getParams() {
  return {
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
const fsBaseSource = await fetch("shader-fragment-base.glsl").then((r) => r.text());
const fsBlurSource = await fetch("shader-fragment-blur.glsl").then((r) => r.text());
const fsComposeSource = await fetch("shader-fragment-compose.glsl").then((r) => r.text());

// --- Programy ---
const programBase = createProgram(gl, vsSource, fsBaseSource);
const programBlur = createProgram(gl, vsSource, fsBlurSource);
const programCompose = createProgram(gl, vsSource, fsComposeSource);

// --- Buffer (quad) ---
const quadVerts = new Float32Array([
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

// --- Pomocnicze funkcje do tworzenia zasobów ---
function createFullresResources() {
  if (!imageTex) return;
  const w = imageWidth;
  const h = imageHeight;

  if (fullresBaseTex) { gl.deleteTexture(fullresBaseTex); gl.deleteFramebuffer(fullresBaseFb); }
  fullresBaseTex = createTexture(gl, w, h);
  fullresBaseFb = createFramebuffer(gl, fullresBaseTex);

  for (let i = 0; i < 5; i++) {
    if (fullresGlowTex[i]) { gl.deleteTexture(fullresGlowTex[i]); gl.deleteFramebuffer(fullresGlowFb[i]); }
    fullresGlowTex[i] = createTexture(gl, w, h);
    fullresGlowFb[i] = createFramebuffer(gl, fullresGlowTex[i]);
  }

  if (fullresTempTex1) { gl.deleteTexture(fullresTempTex1); gl.deleteFramebuffer(fullresTempFb1); }
  if (fullresTempTex2) { gl.deleteTexture(fullresTempTex2); gl.deleteFramebuffer(fullresTempFb2); }
  fullresTempTex1 = createTexture(gl, w, h);
  fullresTempFb1 = createFramebuffer(gl, fullresTempTex1);
  fullresTempTex2 = createTexture(gl, w, h);
  fullresTempFb2 = createFramebuffer(gl, fullresTempTex2);
}

function createPreviewResources() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);

  canvas.width = w;
  canvas.height = h;

  if (previewBaseTex) { gl.deleteTexture(previewBaseTex); gl.deleteFramebuffer(previewBaseFb); }
  previewBaseTex = createTexture(gl, w, h);
  previewBaseFb = createFramebuffer(gl, previewBaseTex);

  for (let i = 0; i < 5; i++) {
    if (previewGlowTex[i]) { gl.deleteTexture(previewGlowTex[i]); gl.deleteFramebuffer(previewGlowFb[i]); }
    previewGlowTex[i] = createTexture(gl, w, h);
    previewGlowFb[i] = createFramebuffer(gl, previewGlowTex[i]);
  }

  if (previewTempTex1) { gl.deleteTexture(previewTempTex1); gl.deleteFramebuffer(previewTempFb1); }
  if (previewTempTex2) { gl.deleteTexture(previewTempTex2); gl.deleteFramebuffer(previewTempFb2); }
  previewTempTex1 = createTexture(gl, w, h);
  previewTempFb1 = createFramebuffer(gl, previewTempTex1);
  previewTempTex2 = createTexture(gl, w, h);
  previewTempFb2 = createFramebuffer(gl, previewTempTex2);
}

// --- Renderowanie bazowe ---
function renderBaseToTarget(params, baseFb, width, height, time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, baseFb);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(programBase);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTex);
  gl.uniform1i(gl.getUniformLocation(programBase, "u_image"), 0);

  setUniforms(gl, programBase, {
    u_resolution: [width, height],
    u_time: time, // NAPRAWA: przekazywany rzeczywisty czas
    u_rotationSpeed: 0,
    u_color: params.color,
    u_shapeType: 0,
    u_useImage: true,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// --- 2-pass blur ---
function renderBlurPass(inputTex, outputFb, sigma, horizontal, width, height) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, outputFb);
  gl.viewport(0, 0, width, height);
  gl.useProgram(programBlur);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, inputTex);
  gl.uniform1i(gl.getUniformLocation(programBlur, "u_texture"), 0);

  setUniforms(gl, programBlur, {
    u_texel: [1.0 / width, 1.0 / height],
    u_sigma: sigma,
    u_horizontal: horizontal,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function renderGlowLayers(params, baseTex, glowFbs, tempFb1, width, height) {
  for (let i = 0; i < params.layersCount; i++) {
    const sigma = params.blurAmount * (i + 1);
    renderBlurPass(baseTex, tempFb1, sigma, true, width, height);
    renderBlurPass(tempFb1, glowFbs[i], sigma, false, width, height);
  }
}

// --- Kompozycja ---
function renderComposeToScreen(params, baseTex, glowTexArray, screenWidth, screenHeight, time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, screenWidth, screenHeight);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(programCompose);

  const texNames = ["u_base", "u_glow1", "u_glow2", "u_glow3", "u_glow4", "u_glow5"];
  texNames.forEach((name, i) => {
    const loc = gl.getUniformLocation(programCompose, name);
    gl.activeTexture(gl.TEXTURE0 + i);
    if (i === 0) {
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
    } else if (i <= params.layersCount) {
      gl.bindTexture(gl.TEXTURE_2D, glowTexArray[i - 1]);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
    }
    gl.uniform1i(loc, i);
  });

  setUniforms(gl, programCompose, {
    u_glowStrength: params.glowStrength,
    u_layersCount: params.layersCount,
    u_breatheEnabled: params.breatheEnabled,
    u_time: time, // NAPRAWA: przekazywany rzeczywisty czas
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// --- Podgląd w czasie rzeczywistym ---
function renderPreview(time) {
  if (!imageTex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }

  const params = getParams();
  const w = canvas.width;
  const h = canvas.height;

  renderBaseToTarget(params, previewBaseFb, w, h, time);
  renderGlowLayers(params, previewBaseTex, previewGlowFb, previewTempFb1, w, h);
  renderComposeToScreen(params, previewBaseTex, previewGlowTex, w, h, time);
}

// --- Renderowanie full-res (do zapisu) ---
function renderFullres(params) {
  if (!imageTex) return;
  const w = imageWidth;
  const h = imageHeight;
  const time = 0; // Statyczny czas dla zapisywanego obrazu

  renderBaseToTarget(params, fullresBaseFb, w, h, time);
  renderGlowLayers(params, fullresBaseTex, fullresGlowFb, fullresTempFb1, w, h);

  const outTex = createTexture(gl, w, h);
  const outFb = createFramebuffer(gl, outTex);

  gl.bindFramebuffer(gl.FRAMEBUFFER, outFb);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(programCompose);

  const texNames = ["u_base", "u_glow1", "u_glow2", "u_glow3", "u_glow4", "u_glow5"];
  texNames.forEach((name, i) => {
    const loc = gl.getUniformLocation(programCompose, name);
    gl.activeTexture(gl.TEXTURE0 + i);
    if (i === 0) {
      gl.bindTexture(gl.TEXTURE_2D, fullresBaseTex);
    } else if (i <= params.layersCount) {
      gl.bindTexture(gl.TEXTURE_2D, fullresGlowTex[i - 1]);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, fullresBaseTex);
    }
    gl.uniform1i(loc, i);
  });

  setUniforms(gl, programCompose, {
    u_glowStrength: params.glowStrength,
    u_layersCount: params.layersCount,
    u_breatheEnabled: params.breatheEnabled,
    u_time: time,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempGl = tempCanvas.getContext("2d");

  const pixels = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, outFb);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const imageData = tempGl.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const srcRow = y * w * 4;
    const dstRow = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x++) {
      imageData.data[dstRow + x] = pixels[srcRow + x];
    }
  }

  tempGl.putImageData(imageData, 0, 0);

  const link = document.createElement("a");
  link.download = "gaussian-floater-result.png";
  link.href = tempCanvas.toDataURL("image/png");
  link.click();

  gl.deleteTexture(outTex);
  gl.deleteFramebuffer(outFb);
}

// --- Obsługa zdarzeń ---
loadImageBtn.addEventListener("click", () => imageFileInput.click());

imageFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  if (imageTex) gl.deleteTexture(imageTex);
  imageTex = createTextureFromImage(gl, img);
  imageWidth = img.width;
  imageHeight = img.height;

  createFullresResources();
  createPreviewResources();
  imageFileInput.value = "";
});

saveProcessedBtn.addEventListener("click", () => {
  if (!imageTex) {
    alert("Najpierw wczytaj obraz.");
    return;
  }
  renderFullres(getParams());
});

// --- Pętla renderowania (ciągła dla płynnej animacji) ---
function render() {
  const time = performance.now() / 1000.0; // Rzeczywisty czas w sekundach

  if (!imageTex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  } else {
    renderPreview(time); // Ciągłe renderowanie dla efektu "oddychania"
  }

  requestAnimationFrame(render);
}

function resize() {
  if (imageTex) {
    createPreviewResources();
  } else {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
}

window.addEventListener("resize", resize);
resize();
render();
