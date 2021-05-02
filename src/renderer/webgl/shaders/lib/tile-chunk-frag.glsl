// Shared code for the tile chunk fragment shader.

#pragma glslify: shade_tile = require('../lib/shade-tile.glsl')
#ifndef HDR_COMPOSITE
#pragma glslify: tonemap = require('../lib/tonemap.glsl')
#endif

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

float PROJECTION_ANGLE = 1.0471975511965976; // 60°
vec3 get_view_ray() {
    vec3 view_ray = normalize(vec3(-1, -1, 0));
    view_ray.z = -cos(PROJECTION_ANGLE);
    view_ray.xy *= sin(PROJECTION_ANGLE);
    return view_ray;
}

void adjust_cube_depth(inout vec3 cube_pos, float i_z) {
    vec3 view_ray = get_view_ray();

    float ray_dxy = dot(view_ray, normalize(vec3(-1, -1, 0)));
    float ray_dz = dot(view_ray, vec3(0, 0, 1));

    // adjusted_cube_pos = cube_pos   + view_ray * ray_t
    //               i_z = cube_pos.z +   ray_dz * ray_t
    float ray_t = (i_z - cube_pos.z) / ray_dz;
    cube_pos += view_ray * ray_t;
}

void light_fragment(
#ifdef SET_FRAG_DEPTH
    in mat4 i_proj_view,
#endif
    in vec3 i_camera_pos,
    in vec3 i_obj_pos,
    in vec3 i_cube_pos,
    in vec3 i_cube_size,
    in vec4 i_color,
    in vec4 i_normal_raw,
    in vec4 i_material_raw,
    in GlobalLighting global_lighting,
    in ChunkLighting chunk_lighting,
    out vec4 out_color,
    out float out_tonemap
) {
    float i_z = i_normal_raw.w * 2.;
    vec3 cube_pos = i_cube_pos;

    if (i_z < 1.99) {
        // z data available
        adjust_cube_depth(cube_pos, i_z);

#ifdef SET_FRAG_DEPTH
        // https://stackoverflow.com/a/12904072
        float d_near = gl_DepthRange.near;
        float d_far = gl_DepthRange.far;
        vec4 clip_space_pos = i_proj_view * vec4(i_obj_pos + cube_pos * i_cube_size, 1);
        float ndc_depth = clip_space_pos.z / clip_space_pos.w;
        gl_FragDepth = (((d_far - d_near) * ndc_depth) + d_near + d_far) / 2.;
#endif
    } else {
#ifdef SET_FRAG_DEPTH
        gl_FragDepth = gl_FragCoord.z;
#endif
    }

    vec3 i_world_pos = i_obj_pos + cube_pos * i_cube_size;

    // lighting enabled
    vec3 view_ray = get_view_ray();
    vec3 view_dir = normalize(-view_ray);
#ifdef false
    view_dir = normalize(i_camera_pos - i_world_pos);
#endif

    vec3 i_normal = read_normal(i_normal_raw);
    vec3 i_emission = (exp(i_material_raw.xyz) - vec3(1.)) * 32.;
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

#ifdef FEATURE_POINT_LIGHTS
    // point lights
    for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
        if (i >= chunk_lighting.point_light_count) break;
        PointLight light = chunk_lighting.point_lights[i];
        vec3 light_dir = normalize(light.pos - i_world_pos);
        float light_dist = length(light.pos - i_world_pos);
        vec3 light_radiance = light.radiance / (light_dist * light_dist);
        float lr_max = max(light_radiance.r, max(light_radiance.g, light_radiance.b));

        light_radiance *= max(0., 1. - exp(-5. * (lr_max - LIGHT_CULL_EPSILON)));

        out_color.rgb += shade_tile(i_color.rgb, i_normal, i_roughness, light_dir, view_dir, light_radiance);
    }
#endif
    out_color.rgb += i_emission;

#ifdef HDR_COMPOSITE
    out_tonemap = 1.;
#else
    out_color.rgb = tonemap(out_color.rgb);
    out_tonemap = 0.;
#endif

#ifdef DEBUG_SHOW_GEOMETRY
    out_color.rgb = vec3(
    mod(i_world_pos.x, 0.2) > 0.1 ? 1. : 0.,
    mod(i_world_pos.y, 0.2) > 0.1 ? 1. : 0.,
    mix(i_world_pos.z, 1., pow(sin(i_world_pos.z * 100.), 2.))
    );
    out_color.a = 1.;
    out_tonemap = 0.;
#endif
}
