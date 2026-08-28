import { initGL, createProgram, createBuffer, setUniforms } from "./webgl-helpers.js";

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

// --- WebGL ---

const vsSource = await fetch("shader-vertex.glsl").then((r) => r.text());
const fsSource = await fetch("shader-fragment.glsl").then((r) => r.text());

const program = createProgram(gl, vsSource, fsSource);
gl.useProgram(program);

const positionBuffer = createBuffer(
  gl,
  new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ])
);

const aPosition = gl.getAttribLocation(program, "a_position");
gl.enableVertexAttribArray(aPosition);
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

// --- Render loop ---

let startTime = performance.now();

function render() {
  const now = performance.now();
  const time = (now - startTime) / 1000;

  const params = getParams();

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  setUniforms(gl, program, {
    u_resolution: [canvas.width, canvas.height],
    u_time: time,
    u_rotationSpeed: params.rotationSpeed,
    u_blurAmount: params.blurAmount,
    u_glowStrength: params.glowStrength,
    u_color: params.color,
    u_layersCount: params.layersCount,
    u_shapeType: params.shapeType,
    u_breatheEnabled: params.breatheEnabled ? 1 : 0,
  });

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(render);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
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
