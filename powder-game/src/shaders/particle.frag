precision mediump float;

varying vec2 v_texCoord;

uniform sampler2D u_elements;    // R8: element IDs
uniform sampler2D u_metadata;    // R8: heat/age values
uniform sampler2D u_palette;     // 1D RGBA palette (ELEMENT_COUNT x 1)
uniform vec2 u_gridSize;         // grid width, height
uniform float u_time;            // for animation

// Simple hash for per-pixel jitter
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Sample element ID
  float elemId = texture2D(u_elements, v_texCoord).r * 255.0;
  float meta = texture2D(u_metadata, v_texCoord).r * 255.0;

  // Empty cell -> background
  if (elemId < 0.5) {
    gl_FragColor = vec4(13.0/255.0, 13.0/255.0, 18.0/255.0, 1.0);
    return;
  }

  // Look up palette color (normalize elemId to 0-1 range for texture lookup)
  float paletteU = (elemId + 0.5) / 16.0; // 16 slots in palette texture
  vec4 color = texture2D(u_palette, vec2(paletteU, 0.5));

  // Per-pixel color jitter (+/-10%)
  vec2 gridPos = v_texCoord * u_gridSize;
  float jitter = hash(floor(gridPos)) * 0.2 - 0.1; // -0.1 to +0.1
  color.rgb += jitter;

  // Glow effect for fire (3), lava (10), electricity (12)
  bool isGlowy = elemId > 2.5 && elemId < 3.5;       // fire
  isGlowy = isGlowy || (elemId > 9.5 && elemId < 10.5); // lava
  isGlowy = isGlowy || (elemId > 11.5 && elemId < 12.5); // electricity

  if (isGlowy) {
    float glowIntensity = meta / 255.0;
    color.rgb += glowIntensity * 0.3;

    // Animated flicker for fire
    if (elemId > 2.5 && elemId < 3.5) {
      float flicker = hash(floor(gridPos) + vec2(u_time * 10.0, 0.0)) * 0.15;
      color.rgb += flicker;
    }
  }

  color.rgb = clamp(color.rgb, 0.0, 1.0);
  gl_FragColor = color;
}
