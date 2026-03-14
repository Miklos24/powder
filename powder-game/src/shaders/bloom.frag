precision mediump float;

varying vec2 v_texCoord;

uniform sampler2D u_texture;       // input texture
uniform sampler2D u_sceneTexture;  // original scene (composite pass only)
uniform vec2 u_texelSize;          // 1.0 / texture dimensions
uniform int u_mode;                // 0=extract, 1=blur-h, 2=blur-v, 3=composite

// Brightness threshold for bloom extraction
const float THRESHOLD = 0.82;
const float BLOOM_INTENSITY = 0.25;

void main() {
  // Extract bright pixels
  if (u_mode == 0) {
    vec4 color = texture2D(u_texture, v_texCoord);
    float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (brightness > THRESHOLD) {
      gl_FragColor = vec4(color.rgb * (brightness - THRESHOLD) / (1.0 - THRESHOLD), 1.0);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
    return;
  }

  // Horizontal box blur (5-tap)
  if (u_mode == 1) {
    vec3 sum = vec3(0.0);
    sum += texture2D(u_texture, v_texCoord + vec2(-2.0 * u_texelSize.x, 0.0)).rgb;
    sum += texture2D(u_texture, v_texCoord + vec2(-1.0 * u_texelSize.x, 0.0)).rgb;
    sum += texture2D(u_texture, v_texCoord).rgb;
    sum += texture2D(u_texture, v_texCoord + vec2( 1.0 * u_texelSize.x, 0.0)).rgb;
    sum += texture2D(u_texture, v_texCoord + vec2( 2.0 * u_texelSize.x, 0.0)).rgb;
    gl_FragColor = vec4(sum / 5.0, 1.0);
    return;
  }

  // Vertical box blur (5-tap)
  if (u_mode == 2) {
    vec3 sum = vec3(0.0);
    sum += texture2D(u_texture, v_texCoord + vec2(0.0, -2.0 * u_texelSize.y)).rgb;
    sum += texture2D(u_texture, v_texCoord + vec2(0.0, -1.0 * u_texelSize.y)).rgb;
    sum += texture2D(u_texture, v_texCoord).rgb;
    sum += texture2D(u_texture, v_texCoord + vec2(0.0,  1.0 * u_texelSize.y)).rgb;
    sum += texture2D(u_texture, v_texCoord + vec2(0.0,  2.0 * u_texelSize.y)).rgb;
    gl_FragColor = vec4(sum / 5.0, 1.0);
    return;
  }

  // Composite: original scene + bloom
  if (u_mode == 3) {
    vec3 scene = texture2D(u_sceneTexture, v_texCoord).rgb;
    vec3 bloom = texture2D(u_texture, v_texCoord).rgb;
    gl_FragColor = vec4(scene + bloom * BLOOM_INTENSITY, 1.0);
    return;
  }

  gl_FragColor = texture2D(u_texture, v_texCoord);
}
