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

// --- UI: elementy ---

const addFilesBtn = document.getElementById("addFilesBtn");
const loadFromGitHubBtn = document.getElementById("loadFromGitHubBtn");
const imageFilesInput = document.getElementById("imageFiles");
const galleryEl = document.getElementById("gallery");

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

const ghTokenEl = document.getElementById("ghToken");
const ghOwnerEl = document.getElementById("ghOwner");
const ghRepoEl = document.getElementById("ghRepo");
const ghBranchEl = document.getElementById("ghBranch");
const ghFolderEl = document.getElementById("ghFolder");
const uploadSelectedBtn = document.getElementById("uploadSelectedBtn");

const savePresetBtn = document.getElementById("savePresetBtn");
const loadPresetBtn = document.getElementById("loadPresetBtn");
const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");

// --- Stan ---

let images = []; // { file?, name, url, img, fromGitHub?, ghPath? }
let selectedIndex = -1;

const PRESET_KEY = "gf_preset_v1";

// --- Domyślne wartości ---

const DEFAULTS = {
  shapeType: "image",
  rotationSpeed: 0.0,
  blurAmount: 0.03,
  glowStrength: 1.2,
  color: [0.2, 0.6, 1.0],
  layersCount: 3,
  breatheEnabled: true,
};

function getParams() {
  const shapeMap = {
    image: 0,
    circle: 1,
    square: 2,
    star: 3,
    noise: 4,
  };
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
    useImage: shapeTypeEl.value === "image" && selectedIndex >= 0,
  };
}

function readUI() {
  return {
    shapeType: shapeTypeEl.value,
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

function writeUI(preset) {
  shapeTypeEl.value = preset.shapeType ?? DEFAULTS.shapeType;
  rotationSpeedEl.value = preset.rotationSpeed ?? DEFAULTS.rotationSpeed;
  blurAmountEl.value = preset.blurAmount ?? DEFAULTS.blurAmount;
  glowStrengthEl.value = preset.glowStrength ?? DEFAULTS.glowStrength;

  const [r, g, b] = preset.color ?? DEFAULTS.color;
  colorREl.value = r;
  colorGEl.value = g;
  colorBEl.value = b;

  layersCountEl.value = preset.layersCount ?? DEFAULTS.layersCount;
  breatheEnabledEl.checked =
    preset.breatheEnabled !== undefined
      ? preset.breatheEnabled
      : DEFAULTS.breatheEnabled;
}

// --- Presety (localStorage) ---

savePresetBtn.addEventListener("click", () => {
  const preset = readUI();
  localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
  alert("Preset zapisany w przeglądarce.");
});

loadPresetBtn.addEventListener("click", () => {
  const raw = localStorage.getItem(PRESET_KEY);
  if (!raw) {
    alert("Brak zapisanego presetu.");
    return;
  }
  try {
    const preset = JSON.parse(raw);
    writeUI(preset);
  } catch (err) {
    console.error(err);
    alert("Błąd wczytywania presetu.");
  }
});

resetDefaultsBtn.addEventListener("click", () => {
  writeUI(DEFAULTS);
});

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
let imageTex = null;

const glowTex = [];
const glowFb = [];

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

  if (baseTex) gl.deleteTexture(baseTex);
  if (baseFb) gl.deleteFramebuffer(baseFb);
  baseTex = createTexture(gl, width, height);
  baseFb = createFramebuffer(gl, baseTex);

  for (let i = 0; i < 5; i++) {
    if (glowTex[i]) gl.deleteTexture(glowTex[i]);
    if (glowFb[i]) gl.deleteFramebuffer(glowFb[i]);
    glowTex[i] = createTexture(gl, width, height);
    glowFb[i] = createFramebuffer(gl, glowTex[i]);
  }

  if (tempTex1) gl.deleteTexture(tempTex1);
  if (tempFb1) gl.deleteFramebuffer(tempFb1);
  if (tempTex2) gl.deleteTexture(tempTex2);
  if (tempFb2) gl.deleteFramebuffer(tempFb2);

  tempTex1 = createTexture(gl, width, height);
  tempFb1 = createFramebuffer(gl, tempTex1);
  tempTex2 = createTexture(gl, width, height);
  tempFb2 = createFramebuffer(gl, tempTex2);
}

// --- Galeria – dodawanie plików z dysku ---

addFilesBtn.addEventListener("click", () => {
  imageFilesInput.click();
});

imageFilesInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));

  await addImagesToGallery(
    imageFiles.map((file) => ({
      file,
      name: file.name,
      fromGitHub: false,
    }))
  );

  // Reset inputu, żeby można było wybrać te same pliki ponownie
  imageFilesInput.value = "";
});

async function addImagesToGallery(items) {
  // items: { file?, name, fromGitHub, ghPath?, rawUrl? }
  for (const item of items) {
    let img;
    let url;

    if (item.fromGitHub) {
      url = item.rawUrl;
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
    } else {
      url = URL.createObjectURL(item.file);
      img = new Image();
      img.src = url;
    }

    try {
      await img.decode();
    } catch (err) {
      console.warn("Nie udało się załadować obrazu:", item.name, err);
      continue;
    }

    const index = images.length;

    const itemEl = document.createElement("div");
    itemEl.className = "gallery-item";

    const imageEl = document.createElement("img");
    imageEl.src = url;
    itemEl.appendChild(imageEl);

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = item.name;
    itemEl.appendChild(nameEl);

    itemEl.addEventListener("click", () => {
      if (selectedIndex >= 0 && images[selectedIndex]) {
        const prev = galleryEl.children[selectedIndex];
        if (prev) prev.classList.remove("selected");
      }
      selectedIndex = index;
      itemEl.classList.add("selected");

      if (imageTex) gl.deleteTexture(imageTex);
      imageTex = createTextureFromImage(gl, img);

      shapeTypeEl.value = "image";
    });

    galleryEl.appendChild(itemEl);

    images.push({
      file: item.file || null,
      name: item.name,
      url,
      img,
      fromGitHub: !!item.fromGitHub,
      ghPath: item.ghPath || null,
    });
  }
}

// --- Galeria – wczytywanie z GitHub API ---

loadFromGitHubBtn.addEventListener("click", async () => {
  const token = ghTokenEl.value.trim();
  const owner = ghOwnerEl.value.trim();
  const repo = ghRepoEl.value.trim();
  const branch = ghBranchEl.value.trim() || "main";
  const folder = (ghFolderEl.value.trim() || "images").replace(/\/+$/, "");

  if (!owner || !repo) {
    alert("Podaj właściciela i nazwę repozytorium.");
    return;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}?ref=${branch}`;

    const headers = {
      Accept: "application/vnd.github+json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("Odpowiedź GitHub nie jest listą plików.");
    }

    const imageItems = data
      .filter((f) => f.type === "file" && /(\.png|\.jpg|\.jpeg|\.gif|\.webp)$/i.test(f.name))
      .map((f) => {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder}/${f.name}`;
        return {
          file: null,
          name: f.name,
          fromGitHub: true,
          ghPath: f.path,
          rawUrl,
        };
      });

    if (imageItems.length === 0) {
      alert("Brak plików graficznych w tym folderze.");
      return;
    }

    await addImagesToGallery(imageItems);
  } catch (err) {
    console.error(err);
    alert("Błąd wczytywania z GitHub: " + err.message);
  }
});

// --- Renderowanie bazowe ---

function renderBase(params) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, baseFb);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(programBase);

  if (params.useImage && imageTex) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTex);
    const uImage = gl.getUniformLocation(programBase, "u_image");
    gl.uniform1i(uImage, 0);
  }

  setUniforms(gl, programBase, {
    u_resolution: [canvas.width, canvas.height],
    u_time: performance.now() / 1000,
    u_rotationSpeed: params.rotationSpeed,
    u_color: params.color,
    u_shapeType: params.shapeType,
    u_useImage: params.useImage && !!imageTex,
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
  const sigmaBase = params.blurAmount;
  const sigma = sigmaBase * (layerIndex + 1);

  renderBlurPass(baseTex, tempFb1, sigma, true);
  renderBlurPass(tempTex1, glowFb[layerIndex], sigma, false);
}

// --- Kompozycja ---

function renderCompose(params) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.02, 0.04, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(programCompose);

  const texNames = [
    "u_base",
    "u_glow1",
    "u_glow2",
    "u_glow3",
    "u_glow4",
    "u_glow5",
  ];
  texNames.forEach((name, i) => {
    const loc = gl.getUniformLocation(programCompose, name);
    gl.activeTexture(gl.TEXTURE0 + i);
    if (i === 0) {
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
    } else if (i <= params.layersCount) {
      gl.bindTexture(gl.TEXTURE_2D, glowTex[i - 1]);
    } else {
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
  const params = getParams();

  renderBase(params);

  for (let i = 0; i < params.layersCount; i++) {
    renderGlowLayer(i, params);
  }

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

// --- GitHub upload (prosty klient API) ---

async function uploadToGitHub({
  token,
  owner,
  repo,
  branch,
  path,
  contentBase64,
}) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  let sha = null;
  try {
    const getRes = await fetch(url + `?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (err) {
    console.warn("Błąd sprawdzania pliku:", err);
  }

  const body = {
    message: "Upload obrazu przez Gaussian Floater UI",
    content: contentBase64,
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }

  return res.json();
}

uploadSelectedBtn.addEventListener("click", async () => {
  if (selectedIndex < 0 || !images[selectedIndex]) {
    alert("Wybierz najpierw obraz z galerii.");
    return;
  }

  const token = ghTokenEl.value.trim();
  const owner = ghOwnerEl.value.trim();
  const repo = ghRepoEl.value.trim();
  const branch = ghBranchEl.value.trim() || "main";
  const folder = (ghFolderEl.value.trim() || "images").replace(/\/+$/, "");
  const entry = images[selectedIndex];

  if (!token || !owner || !repo) {
    alert("Wypełnij: token, właściciela i nazwę repo.");
    return;
  }

  if (!entry.file) {
    alert(
      "Aktualnie wysyłanie działa tylko dla obrazów dodanych z dysku (przez «Dodaj obrazy»)."
    );
    return;
  }

  const file = entry.file;

  try {
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const contentBase64 = btoa(binary);

    const path = `${folder}/${file.name}`;

    const result = await uploadToGitHub({
      token,
      owner,
      repo,
      branch,
      path,
      contentBase64,
    });

    console.log("Wynik uploadu:", result);
    alert(`Obraz wysłany:\n${path}\n(w repo ${owner}/${repo}, gałąź ${branch})`);
  } catch (err) {
    console.error(err);
    alert("Błąd wysyłania: " + err.message);
  }
});
