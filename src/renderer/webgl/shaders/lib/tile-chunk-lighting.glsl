#ifndef TILE_CHUNK_LIGHTING
#define TILE_CHUNK_LIGHTING
#define MAX_POINT_LIGHTS 4

struct GlobalLighting {
    vec3 ambient_radiance;
    vec3 sun_dir;
    vec3 sun_radiance;
};
struct PointLight {
    vec3 pos;
    vec3 radiance;
};
struct ChunkLighting {
    int point_light_count;
    PointLight point_lights[MAX_POINT_LIGHTS];
};

#endif
