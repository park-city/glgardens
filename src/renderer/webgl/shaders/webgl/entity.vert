precision highp float;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_entity_transform;

attribute vec3 a_position;
attribute vec2 a_uv;
attribute vec3 a_normal;

varying vec3 v_world_pos;
varying vec2 v_uv;
varying vec3 v_normal;

void main() {
    v_uv = a_uv;
    v_world_pos = (u_entity_transform * vec4(a_position, 1)).xyz;
    v_normal = (u_entity_transform * vec4(a_position + a_normal, 1)).xyz - v_world_pos;
    gl_Position = u_proj * u_view * vec4(v_world_pos, 1);
}
