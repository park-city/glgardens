#version 300 es
precision highp float;

uniform sampler2D u_color;
uniform int u_vert;

in vec2 v_uv;
out vec4 out_color;

float kernel[7] = float[](
    1. / 64.,
    6. / 64.,
    15. / 64.,
    20. / 64.,
    15. / 64.,
    6. / 64.,
    1. / 64.
);

void main() {
    ivec2 iuv = ivec2(v_uv * vec2(textureSize(u_color, 0)));

    ivec2 d = u_vert == 1 ? ivec2(0, 1) : ivec2(1, 0);
    out_color = vec4(0);

    for (int i = -3; i <= 3; i++) {
        vec4 s = texelFetch(u_color, iuv + d * i, 0);
        out_color += s * kernel[i + 3];
    }
}
