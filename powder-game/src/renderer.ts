import { ELEMENT_COUNT } from './types';
import { ELEMENTS } from './simulation/elements';
import quadVertSrc from './shaders/quad.vert?raw';
import particleFragSrc from './shaders/particle.frag?raw';

export class Renderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private elementTex: WebGLTexture;
  private metadataTex: WebGLTexture;
  private gridWidth: number;
  private gridHeight: number;

  // Uniform locations
  private uElements: WebGLUniformLocation;
  private uMetadata: WebGLUniformLocation;
  private uPalette: WebGLUniformLocation;
  private uGridSize: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Compile shaders
    const vert = this.compileShader(gl.VERTEX_SHADER, quadVertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, particleFragSrc);
    this.program = this.createProgram(vert, frag);
    gl.useProgram(this.program);

    // Fullscreen quad geometry
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Create textures
    this.elementTex = this.createGridTexture();
    this.metadataTex = this.createGridTexture();
    this.createPaletteTexture();

    // Get uniform locations
    this.uElements = gl.getUniformLocation(this.program, 'u_elements')!;
    this.uMetadata = gl.getUniformLocation(this.program, 'u_metadata')!;
    this.uPalette = gl.getUniformLocation(this.program, 'u_palette')!;
    this.uGridSize = gl.getUniformLocation(this.program, 'u_gridSize')!;
    this.uTime = gl.getUniformLocation(this.program, 'u_time')!;

    // Bind texture units
    gl.uniform1i(this.uElements, 0);
    gl.uniform1i(this.uMetadata, 1);
    gl.uniform1i(this.uPalette, 2);
    gl.uniform2f(this.uGridSize, gridWidth, gridHeight);

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  draw(elements: Uint8Array, metadata: Uint8Array, time: number): void {
    const gl = this.gl;

    // Upload element grid
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.elementTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      this.gridWidth, this.gridHeight, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, elements
    );

    // Upload metadata grid
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.metadataTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      this.gridWidth, this.gridHeight, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, metadata
    );

    // Palette is static, already bound to TEXTURE2

    gl.uniform1f(this.uTime, time);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.gl.canvas.width = canvasWidth;
    this.gl.canvas.height = canvasHeight;
    this.gl.viewport(0, 0, canvasWidth, canvasHeight);
  }

  private createGridTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private createPaletteTexture(): void {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    // 16 pixels wide (padded), 1 pixel tall, RGBA
    const data = new Uint8Array(16 * 4);
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const elem = ELEMENTS[i];
      data[i * 4 + 0] = elem.color[0];
      data[i * 4 + 1] = elem.color[1];
      data[i * 4 + 2] = elem.color[2];
      data[i * 4 + 3] = Math.round(elem.opacity * 255);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      16, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data
    );
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }

  private createProgram(vert: WebGLShader, frag: WebGLShader): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${info}`);
    }
    return program;
  }
}
