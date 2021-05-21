#version 300 es
precision highp float;

#include "tile-chunk.glsl"

layout(std140) uniform UCamera { Camera u_camera; };
layout(std140) uniform UEntity { Entity u_entity; };

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec3 a_normal;

out vec3 v_world_pos;
out vec2 v_uv;
out vec3 v_normal;

void main() {
    v_uv = a_uv;
    v_world_pos = (u_entity.transform * vec4(a_position, 1)).xyz;
    v_normal = (u_entity.transform * vec4(a_position + a_normal, 1)).xyz - v_world_pos;
    gl_Position = u_camera.proj * u_camera.view * vec4(v_world_pos, 1);
}
