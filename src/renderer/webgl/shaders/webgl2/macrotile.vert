#version 300 es
precision highp float;

#include "tile-chunk.glsl"

layout(std140) uniform UCamera { Camera u_camera; };
layout(std140) uniform UChunk { Chunk u_chunk; };
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;

out vec2 v_uv;
out vec3 v_cube_pos;
out vec3 v_cube_size;
out vec3 v_view_dir;

void main() {
    v_uv = a_uv;
    vec3 world_pos = (u_chunk.transform * vec4(a_position, 1)).xyz;
    v_view_dir = normalize(u_camera.pos - world_pos.xyz);

    v_cube_pos = a_position;
    v_cube_size = vec3(8, 8, 1);

    gl_Position = u_camera.proj * u_camera.view * vec4(world_pos, 1);
}
