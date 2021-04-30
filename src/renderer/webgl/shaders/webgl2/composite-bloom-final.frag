#version 300 es
precision highp float;

uniform sampler2D u_color;

in vec2 v_uv;
out vec4 out_color;

void main() {
    out_color = texture(u_color, v_uv);
}
