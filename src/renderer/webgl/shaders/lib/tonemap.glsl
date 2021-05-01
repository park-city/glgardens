// TODO: nicer tonemapping
// http://filmicworlds.com/blog/filmic-tonemapping-operators/
float A = 0.15;
float B = 0.50;
float C = 0.10;
float D = 0.20;
float E = 0.02;
float F = 0.30;
float W = 11.2;
vec3 uc2t(vec3 x) {
    return ((x * (A * x + vec3(C) * B) + vec3(D) * E) / (x * (A * x + vec3(B)) + vec3(D) * F)) - vec3(E / F);
}
vec3 map_rgb(vec3 c) {
    float exposureBias = 1.4;
    c = uc2t(exposureBias * c);
    vec3 whiteScale = vec3(1.) / uc2t(vec3(W));
    return c * whiteScale;
}
float map_ch(float a) {
    a = pow(a, 1. / 2.2);
    return a;
}

vec3 tonemap(vec3 in_color) {
    vec3 out_color = map_rgb(in_color);
    out_color.r = map_ch(out_color.r);
    out_color.g = map_ch(out_color.g);
    out_color.b = map_ch(out_color.b);
    return out_color;
}

#pragma glslify: export(tonemap)
