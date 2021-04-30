precision highp float;

#include "../lib/tile-chunk-vert.glsl"

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_chunk_transform;
uniform vec4 u_chunk_load_anim;
uniform vec3 u_camera_pos;

attribute vec3 a_position;
attribute vec2 a_obj_pos;
attribute vec2 a_uv;
attribute vec2 a_tile;

varying vec2 v_uv;
varying vec2 v_tile;
varying vec3 v_world_pos;
varying vec3 v_view_dir;
varying float v_presence;

void main() {
    v_uv = a_uv;
    v_tile = a_tile;
    v_world_pos = (u_chunk_transform * vec4(a_position, 1)).xyz;
    v_view_dir = normalize(u_camera_pos - v_world_pos.xyz);

    vec2 obj_pos = (u_chunk_transform * vec4(a_obj_pos, 0, 1)).xy;
    tc_load_anim(obj_pos, u_chunk_load_anim, v_world_pos, v_presence);

    gl_Position = u_proj * u_view * vec4(v_world_pos, 1);
}
