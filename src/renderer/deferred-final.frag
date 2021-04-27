precision highp float;

uniform sampler2D u_texture;

varying vec2 v_uv;

// http://filmicworlds.com/blog/filmic-tonemapping-operators/
float A = 0.15;
float B = 0.50;
float C = 0.10;
float D = 0.20;
float E = 0.02;
float F = 0.30;
// float W = 11.2;
float W = 4.2;
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
    a = pow(a, 2.2);
    return a;
}

void main() {
    vec3 color = texture2D(u_texture, v_uv).rgb;

    color = map_rgb(color);

    color.r = map_ch(color.r);
    color.g = map_ch(color.g);
    color.b = map_ch(color.b);

    gl_FragColor = vec4(color, 1.);
}
