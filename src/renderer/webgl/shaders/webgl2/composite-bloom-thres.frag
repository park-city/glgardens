#version 300 es
precision highp float;

uniform sampler2D u_color;

in vec2 v_uv;
out vec4 out_color;

void main() {
    vec4 color = texture(u_color, v_uv);

    float brightness = dot(color.rgb, vec3(0.21, 0.72, 0.07));
    float t = 1. / (1. + exp(5. - 2. * brightness));

    out_color = t * color / 4.;
}
