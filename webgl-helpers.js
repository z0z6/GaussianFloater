export function initGL(canvas) {
  const gl = canvas.getContext("webgl");
  if (!gl) throw new Error("WebGL nieobsługiwane");
  return gl;
}

export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Błąd kompilacji shadera:\n" + log);
  }
  return shader;
}

export function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error("Błąd linkowania programu:\n" + log);
  }
  return program;
}

export function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

export function setUniforms(gl, program, uniforms) {
  for (const [name, value] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(program, name);
    if (!loc) continue;

    if (Array.isArray(value)) {
      if (value.length === 2) {
        gl.uniform2fv(loc, value);
      } else if (value.length === 3) {
        gl.uniform3fv(loc, value);
      } else if (value.length === 4) {
        gl.uniform4fv(loc, value);
      } else if (value.length === 1) {
        gl.uniform1fv(loc, value);
      }
    } else if (typeof value === "number") {
      gl.uniform1f(loc, value);
    } else if (typeof value === "boolean") {
      gl.uniform1i(loc, value ? 1 : 0);
    } else if (typeof value === "string") {
      gl.uniform1i(loc, parseInt(value, 10));
    }
  }
}
