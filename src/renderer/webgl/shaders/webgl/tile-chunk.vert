precision highp float;

#include "../lib/tile-chunk-vert.glsl"

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_chunk_transform;
uniform vec4 u_chunk_load_anim;
uniform vec3 u_camera_pos;
uniform float u_cache_render;

attribute vec3 a_position;
attribute vec2 a_uv;
attribute vec2 a_tile;
attribute vec3 a_obj_pos;

varying vec2 v_uv;
varying vec2 v_tile;
varying vec3 v_obj_pos;
varying vec3 v_cube_pos;
varying vec3 v_cube_size;
varying vec3 v_view_dir;
varying float v_presence;

void main() {
    v_uv = a_uv;
    v_tile = a_tile;
    vec3 world_pos = (u_chunk_transform * vec4(a_position, 1)).xyz;
    v_view_dir = normalize(u_camera_pos - world_pos.xyz);

    v_obj_pos = (u_chunk_transform * vec4(a_obj_pos, 1)).xyz;
    tc_load_anim(v_obj_pos.xy, u_chunk_load_anim, world_pos.z, v_presence);

    v_cube_pos = a_position - a_obj_pos;
    v_cube_size = vec3(1, 1, 1);

    gl_Position = u_proj * u_view * vec4(mix(world_pos, a_position, u_cache_render), 1);
}
