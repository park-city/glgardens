precision highp float;
precision highp sampler2D;

uniform sampler2D u_macrotile_color;

varying vec2 v_uv;

void main() {
    vec4 i_color = texture2D(u_macrotile_color, v_uv);
    gl_FragColor = i_color;
    if (gl_FragColor.a < 0.01) discard;
}
