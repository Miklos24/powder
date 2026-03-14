import { ELEMENT_COUNT } from './types';
import { ELEMENTS } from './simulation/elements';
import quadVertSrc from './shaders/quad.vert?raw';
import particleFragSrc from './shaders/particle.frag?raw';
import bloomFragSrc from './shaders/bloom.frag?raw';

interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export class Renderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private elementTex: WebGLTexture;
  private metadataTex: WebGLTexture;
  private gridWidth: number;
  private gridHeight: number;

  // Uniform locations (particle program)
  private uElements: WebGLUniformLocation;
  private uMetadata: WebGLUniformLocation;
  private uPalette: WebGLUniformLocation;
  private uGridSize: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;

  // Bloom pipeline
  private bloomProgram: WebGLProgram;
  private sceneFBO: FBO | null = null;
  private bloomFBO_A: FBO | null = null;
  private bloomFBO_B: FBO | null = null;

  // Bloom uniform locations
  private bloomUTexture: WebGLUniformLocation;
  private bloomUSceneTexture: WebGLUniformLocation;
  private bloomUTexelSize: WebGLUniformLocation;
  private bloomUMode: WebGLUniformLocation;

  // Canvas pixel dimensions (for FBO sizing)
  private canvasWidth = 0;
  private canvasHeight = 0;

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Compile particle shaders
    const vert = this.compileShader(gl.VERTEX_SHADER, quadVertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, particleFragSrc);
    this.program = this.createProgram(vert, frag);

    // Compile bloom shaders
    const bloomVert = this.compileShader(gl.VERTEX_SHADER, quadVertSrc);
    const bloomFrag = this.compileShader(gl.FRAGMENT_SHADER, bloomFragSrc);
    this.bloomProgram = this.createProgram(bloomVert, bloomFrag);

    // Fullscreen quad geometry (shared by both programs)
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Set up attribute for particle program
    gl.useProgram(this.program);
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Create textures
    this.elementTex = this.createGridTexture();
    this.metadataTex = this.createGridTexture();
    this.createPaletteTexture();

    // Get uniform locations (particle program)
    this.uElements = gl.getUniformLocation(this.program, 'u_elements')!;
    this.uMetadata = gl.getUniformLocation(this.program, 'u_metadata')!;
    this.uPalette = gl.getUniformLocation(this.program, 'u_palette')!;
    this.uGridSize = gl.getUniformLocation(this.program, 'u_gridSize')!;
    this.uTime = gl.getUniformLocation(this.program, 'u_time')!;

    // Bind texture units (particle program)
    gl.uniform1i(this.uElements, 0);
    gl.uniform1i(this.uMetadata, 1);
    gl.uniform1i(this.uPalette, 2);
    gl.uniform2f(this.uGridSize, gridWidth, gridHeight);

    // Get bloom uniform locations
    gl.useProgram(this.bloomProgram);
    this.bloomUTexture = gl.getUniformLocation(this.bloomProgram, 'u_texture')!;
    this.bloomUSceneTexture = gl.getUniformLocation(this.bloomProgram, 'u_sceneTexture')!;
    this.bloomUTexelSize = gl.getUniformLocation(this.bloomProgram, 'u_texelSize')!;
    this.bloomUMode = gl.getUniformLocation(this.bloomProgram, 'u_mode')!;

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  draw(elements: Uint8Array, metadata: Uint8Array, time: number): void {
    const gl = this.gl;

    // Ensure FBOs exist
    if (!this.sceneFBO) return;

    // --- Pass 1: Render scene to FBO ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.framebuffer);
    gl.viewport(0, 0, this.sceneFBO.width, this.sceneFBO.height);

    gl.useProgram(this.program);

    // Set up attribute (re-bind since bloom program also uses it)
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

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

    gl.uniform1f(this.uTime, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- Pass 2: Extract bright pixels to half-res FBO A ---
    gl.useProgram(this.bloomProgram);
    const bloomAPos = gl.getAttribLocation(this.bloomProgram, 'a_position');
    gl.vertexAttribPointer(bloomAPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO_A!.framebuffer);
    gl.viewport(0, 0, this.bloomFBO_A!.width, this.bloomFBO_A!.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.texture);
    gl.uniform1i(this.bloomUTexture, 0);
    gl.uniform1i(this.bloomUMode, 0); // extract
    gl.uniform2f(this.bloomUTexelSize,
      1.0 / this.sceneFBO.width,
      1.0 / this.sceneFBO.height
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- Pass 3: Horizontal blur (A → B) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO_B!.framebuffer);
    gl.viewport(0, 0, this.bloomFBO_B!.width, this.bloomFBO_B!.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO_A!.texture);
    gl.uniform1i(this.bloomUMode, 1); // blur-h
    gl.uniform2f(this.bloomUTexelSize,
      1.0 / this.bloomFBO_A!.width,
      1.0 / this.bloomFBO_A!.height
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- Pass 4: Vertical blur (B → A) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO_A!.framebuffer);
    gl.viewport(0, 0, this.bloomFBO_A!.width, this.bloomFBO_A!.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO_B!.texture);
    gl.uniform1i(this.bloomUMode, 2); // blur-v

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- Pass 5: Composite to screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO_A!.texture); // blurred bloom
    gl.uniform1i(this.bloomUTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.texture); // original scene
    gl.uniform1i(this.bloomUSceneTexture, 1);

    gl.uniform1i(this.bloomUMode, 3); // composite

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Restore texture unit bindings for next frame's particle pass
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.elementTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.metadataTex);
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.gl.canvas.width = canvasWidth;
    this.gl.canvas.height = canvasHeight;
    this.gl.viewport(0, 0, canvasWidth, canvasHeight);

    // Recreate FBOs at new size
    this.createBloomFBOs(canvasWidth, canvasHeight);
  }

  private createBloomFBOs(width: number, height: number): void {
    // Clean up old FBOs
    if (this.sceneFBO) this.deleteFBO(this.sceneFBO);
    if (this.bloomFBO_A) this.deleteFBO(this.bloomFBO_A);
    if (this.bloomFBO_B) this.deleteFBO(this.bloomFBO_B);

    // Full-res scene FBO
    this.sceneFBO = this.createFBO(width, height);

    // Half-res bloom FBOs
    const halfW = Math.max(1, Math.floor(width / 2));
    const halfH = Math.max(1, Math.floor(height / 2));
    this.bloomFBO_A = this.createFBO(halfW, halfH);
    this.bloomFBO_B = this.createFBO(halfW, halfH);
  }

  private createFBO(width: number, height: number): FBO {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { framebuffer: fb, texture: tex, width, height };
  }

  private deleteFBO(fbo: FBO): void {
    const gl = this.gl;
    gl.deleteFramebuffer(fbo.framebuffer);
    gl.deleteTexture(fbo.texture);
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
