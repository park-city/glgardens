#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D u_macrotile_color;
uniform sampler2D u_macrotile_tonemap;

in vec2 v_uv;

layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_tonemap;

void main() {
    vec4 i_color = texture(u_macrotile_color, v_uv);
    vec4 i_tonemap = texture(u_macrotile_tonemap, v_uv);

    out_color = i_color;
    out_tonemap = vec4(i_tonemap.r, 0, 0, i_color.a);

    if (out_color.a < 0.01) discard;
}
