#version 300 es
precision highp float;

#pragma glslify: tonemap = require('../lib/tonemap.glsl')

uniform sampler2D u_color;
uniform sampler2D u_tonemap;

in vec2 v_uv;
out vec4 out_color;

void main() {
    vec4 color = texture(u_color, v_uv);
    float tonemap_fac = texture(u_tonemap, v_uv).r;

    out_color = mix(
        color,
        vec4(tonemap(color.rgb), color.a),
        tonemap_fac
    );
}
