precision highp float;

attribute vec2 a_position;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_light_pos;
uniform vec4 u_light_color;
varying vec2 v_pos;

void main() {
    float light_radius = sqrt(u_light_color.w - abs(u_light_pos.z / 2.)) * 4.;
    if (u_light_color.w < 2.) light_radius *= 4.;
    vec4 pos = vec4(vec3(u_light_pos.xy, 0) + vec3(a_position * 2. - vec2(1), 0) * light_radius, 1);

    gl_Position = u_proj * u_view * pos;
    v_pos = a_position;
}
