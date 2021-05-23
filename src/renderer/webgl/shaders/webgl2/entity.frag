#version 300 es
precision highp float;

#ifdef FEATURE_FBO_FLOAT
#define HDR_COMPOSITE
#endif
#include "../lib/tile-chunk-frag.glsl"

layout(std140) uniform UGlobalLighting { GlobalLighting u_global_lighting; };
layout(std140) uniform UChunkLighting { ChunkLighting u_chunk_lighting; };
uniform sampler2D u_entity_color;
uniform sampler2D u_entity_material;
uniform int u_light_pass_index;

in vec3 v_world_pos;
in vec2 v_uv;
in vec3 v_normal;

layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_tonemap;

void main() {
    vec4 i_color = texture(u_entity_color, v_uv);
    if (i_color.a < 0.01) discard;

    vec4 i_material_raw = texture(u_entity_material, v_uv);

    out_tonemap = vec4(0, 0, 0, i_color.a);

    if (length(v_normal) > 0.1) {
        vec3 view_ray = get_view_ray();
        vec3 view_dir = normalize(-view_ray);

        vec3 i_normal = normalize(v_normal);
        vec3 i_emission = (exp(i_material_raw.xyz) - vec3(1.)) * 32.;
        float i_roughness = 1. - i_material_raw.w;

        out_color = vec4(0, 0, 0, i_color.a);

        if (u_light_pass_index == 0) {
            // ambient light
            out_color.rgb += shade_tile_ambient(i_color.rgb, u_global_lighting.ambient_radiance);

            // sun light
            out_color.rgb += shade_tile(
                i_color.rgb,
                i_normal,
                i_roughness,
                u_global_lighting.sun_dir,
                view_dir,
                u_global_lighting.sun_radiance
            );

            // emission
            out_color.rgb += i_emission;
        }

#ifdef FEATURE_POINT_LIGHTS
        // point lights
        for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
            if (i >= u_chunk_lighting.point_light_count) break;
            PointLight light = u_chunk_lighting.point_lights[i];
            vec3 light_dir = normalize(light.pos - v_world_pos);
            float light_dist = length(light.pos - v_world_pos);
            vec3 light_radiance = light.radiance / (light_dist * light_dist);
            float lr_max = max(light_radiance.r, max(light_radiance.g, light_radiance.b));

            light_radiance *= max(0., 1. - exp(-5. * (lr_max - LIGHT_CULL_EPSILON)));

            out_color.rgb += shade_tile(i_color.rgb, i_normal, i_roughness, light_dir, view_dir, light_radiance);
        }
#endif

#ifdef HDR_COMPOSITE
        out_tonemap.r = 1.;
#else
        out_color.rgb = tonemap(out_color.rgb);
        out_tonemap.r = 0.;
#endif
    } else if (u_light_pass_index == 0) {
        out_color = i_color;
        out_tonemap.r = 0.;
    } else {
        discard;
    }
}
