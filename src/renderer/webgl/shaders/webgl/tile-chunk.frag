precision highp float;

#include "../lib/tile-chunk-frag.glsl"

uniform sampler2D u_tileset_color;
uniform sampler2D u_tileset_normal;
uniform sampler2D u_tileset_material;
uniform vec3 u_camera_pos;
uniform vec3 u_tileset_params;
uniform vec3 u_gl_ambient_radiance;
uniform vec3 u_gl_sun_dir;
uniform vec3 u_gl_sun_radiance;
uniform int u_cl_point_light_count;
uniform vec3 u_cl_point_light_pos[MAX_POINT_LIGHTS];
uniform vec3 u_cl_point_light_radiance[MAX_POINT_LIGHTS];
uniform int u_light_pass_index;

varying vec2 v_uv;
varying vec2 v_tile;
varying vec3 v_obj_pos;
varying vec3 v_cube_pos;
varying vec3 v_cube_size;
varying vec3 v_view_dir;
varying float v_presence;

void main() {
    vec2 tex_coord = vec2((v_uv + v_tile) / u_tileset_params.xy);

    vec4 i_color = texture2D(u_tileset_color, tex_coord);
    vec4 i_normal_raw = texture2D(u_tileset_normal, tex_coord);
    vec4 i_material_raw = texture2D(u_tileset_material, tex_coord);

    i_color.a *= v_presence;
    if (i_color.a < 0.01) discard;

    if (length(i_normal_raw.rgb) > 0.) {
        GlobalLighting global_lighting;
        global_lighting.ambient_radiance = u_gl_ambient_radiance;
        global_lighting.sun_dir = u_gl_sun_dir;
        global_lighting.sun_radiance = u_gl_sun_radiance;

        ChunkLighting chunk_lighting;
        chunk_lighting.point_light_count = u_cl_point_light_count;
        for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
            PointLight light;
            light.pos = u_cl_point_light_pos[i];
            light.radiance = u_cl_point_light_radiance[i];
            chunk_lighting.point_lights[i] = light;
        }

        float out_tonemap;

        light_fragment(
            u_light_pass_index,
            u_camera_pos,
            v_obj_pos,
            v_cube_pos,
            v_cube_size,
            i_color,
            i_normal_raw,
            i_material_raw,
            global_lighting,
            chunk_lighting,
            gl_FragColor,
            out_tonemap
        );
    } else if (u_light_pass_index == 0) {
        gl_FragColor = i_color;
    } else {
        discard;
    }
}
