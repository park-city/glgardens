struct Camera {
    mat4 proj;
    mat4 view;
    vec3 pos;
};
struct Chunk {
    mat4 transform;
    vec4 load_anim;
};

#include "../lib/tile-chunk-lighting.glsl"
