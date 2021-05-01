#version 300 es
precision highp float;

uniform sampler2D u_color;

in vec2 v_uv;
out vec4 out_color;

float MAX_BRIGHTNESS = 2.5;

void main() {
    vec4 color = texture(u_color, v_uv);

    float brightness = dot(color.rgb, vec3(0.21, 0.72, 0.07));
    float t = 1. / (max(0.01, brightness) / MAX_BRIGHTNESS + exp(5. - 2. * brightness));

    out_color = t * color / 3.;
}
