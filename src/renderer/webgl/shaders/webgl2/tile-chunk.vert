#version 300 es
precision highp float;

#include "tile-chunk.glsl"
#include "../lib/tile-chunk-vert.glsl"

layout(std140) uniform UCamera { Camera u_camera; };
layout(std140) uniform UChunk { Chunk u_chunk; };
uniform float u_cache_render;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec2 a_tile;
layout(location = 3) in vec3 a_obj_pos;

out vec2 v_uv;
out vec2 v_tile;
out vec3 v_obj_pos;
out vec3 v_cube_pos;
out vec3 v_cube_size;
out vec3 v_view_dir;
out float v_presence;

void main() {
    v_uv = a_uv;
    v_tile = a_tile;
    vec3 world_pos = (u_chunk.transform * vec4(a_position, 1)).xyz;
    v_view_dir = normalize(u_camera.pos - world_pos.xyz);

    v_obj_pos = (u_chunk.transform * vec4(a_obj_pos, 1)).xyz;
    tc_load_anim(v_obj_pos.xy, u_chunk.load_anim, world_pos.z, v_presence);

    v_cube_pos = a_position - a_obj_pos;
    v_cube_size = vec3(1, 1, 1);

    gl_Position = u_camera.proj * u_camera.view * vec4(mix(world_pos, a_position, u_cache_render), 1);
}
