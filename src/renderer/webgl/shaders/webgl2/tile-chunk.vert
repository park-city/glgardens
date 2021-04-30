#version 300 es
precision highp float;

#include "tile-chunk.glsl"
#include "../lib/tile-chunk-vert.glsl"

layout(std140) uniform UCamera { Camera u_camera; };
layout(std140) uniform UChunk { Chunk u_chunk; };
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec2 a_tile;
layout(location = 3) in vec2 a_obj_pos;

out vec2 v_uv;
out vec2 v_tile;
out vec3 v_world_pos;
out vec3 v_view_dir;
out float v_presence;

void main() {
    v_uv = a_uv;
    v_tile = a_tile;
    v_world_pos = (u_chunk.transform * vec4(a_position, 1)).xyz;
    v_view_dir = normalize(u_camera.pos - v_world_pos.xyz);

    vec2 obj_pos = (u_chunk.transform * vec4(a_obj_pos, 0, 1)).xy;
    tc_load_anim(obj_pos, u_chunk.load_anim, v_world_pos, v_presence);

    gl_Position = u_camera.proj * u_camera.view * vec4(v_world_pos, 1);
}
