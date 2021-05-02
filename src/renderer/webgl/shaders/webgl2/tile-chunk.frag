#version 300 es
precision highp float;
precision highp sampler2DArray;

#include "tile-chunk.glsl"

#ifdef FEATURE_FBO_FLOAT
#define HDR_COMPOSITE
#endif
#define SET_FRAG_DEPTH
#include "../lib/tile-chunk-frag.glsl"

layout(std140) uniform UCamera { Camera u_camera; };
layout(std140) uniform UChunk { Chunk u_chunk; };
layout(std140) uniform UGlobalLighting { GlobalLighting u_global_lighting; };
layout(std140) uniform UChunkLighting { ChunkLighting u_chunk_lighting; };
uniform vec3 u_tileset_params;
uniform sampler2DArray u_tileset_color;
uniform sampler2DArray u_tileset_normal;
uniform sampler2DArray u_tileset_material;

in vec2 v_uv;
in vec2 v_tile;
in vec3 v_obj_pos;
in vec3 v_cube_pos;
in vec3 v_cube_size;
in vec3 v_view_dir;
in float v_presence;

layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_tonemap;

void main() {
    vec3 tex_coord = vec3((v_uv + v_tile) / u_tileset_params.xy, int(u_tileset_params.z));

    vec4 i_color = texture(u_tileset_color, tex_coord);
    vec4 i_normal_raw = texture(u_tileset_normal, tex_coord);
    vec4 i_material_raw = texture(u_tileset_material, tex_coord);

    out_tonemap = vec4(0, 0, 0, i_color.a);

    i_color.a *= v_presence;
    if (i_color.a < 0.01) discard;

    if (length(i_normal_raw.rgb) > 0.) {
        // on android, for SOME reason, passing these uniforms to the light_fragment function
        // directly will cause the values to change.
        // copying them to local variables first seems to work.
        GlobalLighting global_lighting = u_global_lighting;
        // assigning chunk_lighting = u_chunk_lighting causes the program link to fail with an empty
        // string error. So, instead, we'll be copying them over one by one...
        ChunkLighting chunk_lighting;
#ifdef FEATURE_POINT_LIGHTS
        // reading the point lights uniform makes the shader lag quite a lot, so we won't be reading
        // anything unless we really need to..
        chunk_lighting.point_light_count = u_chunk_lighting.point_light_count;
        for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
            if (i >= chunk_lighting.point_light_count) break;
            chunk_lighting.point_lights[i] = u_chunk_lighting.point_lights[i];
        }
#endif

        light_fragment(
#ifdef SET_FRAG_DEPTH
            u_camera.proj * u_camera.view,
#endif
            u_camera.pos,
            v_obj_pos,
            v_cube_pos,
            v_cube_size,
            i_color,
            i_normal_raw,
            i_material_raw,
            global_lighting,
            chunk_lighting,
            out_color,
            out_tonemap.r
        );
    } else {
        out_color = i_color;
        out_tonemap.r = 0.;
#ifdef SET_FRAG_DEPTH
        gl_FragDepth = gl_FragCoord.z;
#endif
    }
}
