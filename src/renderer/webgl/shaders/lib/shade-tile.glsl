#pragma glslify: DisneyMaterial = require('./disney-material.glsl')
#pragma glslify: disneyBRDF = require('./disney-brdf.glsl', DisneyMaterial = DisneyMaterial)


vec3 shade_tile(
    vec3 i_color,
    vec3 i_normal,
    float i_roughness,
    vec3 i_light_dir,
    vec3 i_view_dir,
    vec3 i_light_radiance
) {
    DisneyMaterial dm;
    dm.baseColor = i_color;
    dm.metallic = 0.;
    dm.subsurface = 0.;
    dm.specular = 0.5;
    dm.roughness = i_roughness;
    dm.specularTint = 0.;
    dm.anisotropic = 0.;
    dm.sheen = 0.;
    dm.sheenTint = 0.5;
    dm.clearcoat = 0.;
    dm.clearcoatGloss = 1.;

    vec3 tangent = vec3(0.);
    if (abs(i_normal.x) > abs(i_normal.y)) {
        // solve dot(normal, tangent) = 0 with tangent.x = 0 => nx 0 + ny nz + nz (-ny) = 0
        tangent = normalize(vec3(0., i_normal.z, -i_normal.y));
    } else {
        // with tangent.y = 0 => nx nz + ny 0 + nz (-nx) = 0
        tangent = normalize(vec3(i_normal.z, 0., -i_normal.x));
    }
    vec3 binormal = cross(i_normal, tangent);

    vec3 reflectance = max(vec3(0), disneyBRDF(i_light_dir, i_view_dir, i_normal, tangent, binormal, dm));
    float cos_factor = max(0., dot(i_normal, i_light_dir));

    return i_light_radiance * reflectance * cos_factor;
}

#pragma glslify: export(shade_tile)
