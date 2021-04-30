#pragma glslify: shade_tile = require('../lib/shade-tile.glsl')
#ifndef FEATURE_FBO_FLOAT
#pragma glslify: tonemap = require('../lib/tonemap.glsl')
#endif

#define MAX_POINT_LIGHTS 16
#define LIGHT_CULL_EPSILON 0.3

#include "tile-chunk-lighting.glsl"

// reads a 3D normal vector from a texture sample
vec3 read_normal(vec4 tex_sample) {
    vec3 normal = tex_sample.rgb;
    normal = normalize(normal - vec3(.5));
    // set normal to 0 if its original magnitude was zero
    normal = mix(vec3(0), normal, sign(length(tex_sample.rgb)));
    return normal;
}

vec3 shade_tile_ambient(vec3 i_color, vec3 i_light) {
    return vec3(
        pow(i_color.r, 2.2) * i_light.r,
        pow(i_color.g, 2.2) * i_light.g,
        pow(i_color.b, 2.2) * i_light.b
    );
}

void light_fragment(
    in vec3 i_camera_pos,
    in vec3 i_world_pos,
    in vec4 i_color,
    in vec4 i_normal_raw,
    in vec4 i_material_raw,
    in GlobalLighting global_lighting,
    in ChunkLighting chunk_lighting,
    out vec4 out_color,
    out float out_tonemap
) {
    // lighting enabled
    // FIXME: incorrect for orthographic projection
    vec3 view_dir = normalize(i_camera_pos - i_world_pos);

    vec3 i_normal = read_normal(i_normal_raw);
    vec3 i_emission = sqrt(i_material_raw.xyz) * 32.;
    float i_roughness = 1. - i_material_raw.w;

    out_color = vec4(0, 0, 0, i_color.a);

    // ambient light
    out_color.rgb += shade_tile_ambient(i_color.rgb, global_lighting.ambient_radiance);

    // sun light
    out_color.rgb += shade_tile(
        i_color.rgb,
        i_normal,
        i_roughness,
        global_lighting.sun_dir,
        view_dir,
        global_lighting.sun_radiance
    );

    // point lights
    for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
        if (i >= chunk_lighting.point_light_count) break;
        PointLight light = chunk_lighting.point_lights[i];
        vec3 light_dir = normalize(light.pos - i_world_pos);
        float light_dist = length(light.pos - i_world_pos);
        vec3 light_radiance = light.radiance / (light_dist * light_dist);
        float lr_max = max(light_radiance.r, max(light_radiance.g, light_radiance.b));

        light_radiance *= max(0., 1. - exp(-5. * (lr_max - LIGHT_CULL_EPSILON)));

        if (abs(lr_max - LIGHT_CULL_EPSILON) < 0.04) continue;
        out_color.rgb += shade_tile(i_color.rgb, i_normal, i_roughness, light_dir, view_dir, light_radiance);
    }
    out_color.rgb += i_emission;

#ifdef FEATURE_FBO_FLOAT
    out_tonemap = 1.;
#else
    out_color.rgb = tonemap(out_color.rgb);
    out_tonemap = 0.;
#endif
}
