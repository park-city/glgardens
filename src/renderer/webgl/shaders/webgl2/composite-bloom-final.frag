#version 300 es
precision highp float;

uniform sampler2D u_color;
uniform float u_alpha;

in vec2 v_uv;
layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_tonemap;

void main() {
    out_color = texture(u_color, v_uv);
    out_color *= u_alpha;
    out_tonemap = vec4(0);
}
