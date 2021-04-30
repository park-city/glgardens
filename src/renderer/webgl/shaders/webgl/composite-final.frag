precision highp float;

uniform sampler2D u_color;

varying vec2 v_uv;

void main() {
    gl_FragColor = texture2D(u_color, v_uv);
}
