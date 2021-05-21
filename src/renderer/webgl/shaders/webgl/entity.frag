precision highp float;

#include "../lib/tile-chunk-frag.glsl"

uniform vec3 u_gl_ambient_radiance;
uniform vec3 u_gl_sun_dir;
uniform vec3 u_gl_sun_radiance;
uniform int u_cl_point_light_count;
uniform vec3 u_cl_point_light_pos[MAX_POINT_LIGHTS];
uniform vec3 u_cl_point_light_radiance[MAX_POINT_LIGHTS];
uniform int u_light_pass_index;
uniform sampler2D u_entity_color;
uniform sampler2D u_entity_material;

varying vec3 v_world_pos;
varying vec2 v_uv;
varying vec3 v_normal;

void main() {
    vec4 i_color = texture2D(u_entity_color, v_uv);
    if (i_color.a < 0.01) discard;

    vec4 i_material_raw = texture2D(u_entity_material, v_uv);
    vec4 out_color;

    if (length(v_normal) > 0.1) {
        vec3 view_ray = get_view_ray();
        vec3 view_dir = normalize(-view_ray);

        vec3 i_normal = normalize(v_normal);
        vec3 i_emission = (exp(i_material_raw.xyz) - vec3(1.)) * 32.;
        float i_roughness = 1. - i_material_raw.w;

        out_color = vec4(0, 0, 0, i_color.a);

        if (u_light_pass_index == 0) {
            // ambient light
            out_color.rgb += shade_tile_ambient(i_color.rgb, u_gl_ambient_radiance);

            // sun light
            out_color.rgb += shade_tile(
                i_color.rgb,
                i_normal,
                i_roughness,
                u_gl_sun_dir,
                view_dir,
                u_gl_sun_radiance
            );

            // emission
            out_color.rgb += i_emission;
        }

#ifdef FEATURE_POINT_LIGHTS
        // point lights
        for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
            if (i >= u_cl_point_light_count) break;
            vec3 light_pos = u_cl_point_light_pos[i];
            vec3 light_dir = normalize(light_pos - v_world_pos);
            float light_dist = length(light_pos - v_world_pos);
            vec3 light_radiance = u_cl_point_light_radiance[i] / (light_dist * light_dist);
            float lr_max = max(light_radiance.r, max(light_radiance.g, light_radiance.b));

            light_radiance *= max(0., 1. - exp(-5. * (lr_max - LIGHT_CULL_EPSILON)));

            out_color.rgb += shade_tile(i_color.rgb, i_normal, i_roughness, light_dir, view_dir, light_radiance);
        }
#endif

        out_color.rgb = tonemap(out_color.rgb);
    } else if (u_light_pass_index == 0) {
        out_color = i_color;
    } else {
        discard;
    }

    gl_FragColor = out_color;
}
