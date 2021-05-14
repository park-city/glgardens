precision highp float;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_camera_pos;
uniform mat4 u_chunk_transform;

attribute vec3 a_position;
attribute vec2 a_uv;

varying vec2 v_uv;
varying vec3 v_cube_pos;
varying vec3 v_cube_size;
varying vec3 v_view_dir;

void main() {
    v_uv = a_uv;
    vec3 world_pos = (u_chunk_transform * vec4(a_position, 1)).xyz;
    v_view_dir = normalize(u_camera_pos - world_pos.xyz);

    v_cube_pos = a_position;
    v_cube_size = vec3(8, 8, 1);

    gl_Position = u_proj * u_view * vec4(world_pos, 1);
}
