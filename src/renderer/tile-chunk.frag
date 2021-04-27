precision highp float;

uniform sampler2D u_tileset;
uniform sampler2D u_tileset_normal;
uniform vec2 u_tileset_size;
uniform vec3 u_light_dir;

varying vec2 v_uv;
varying vec2 v_tile;
varying vec4 v_world_pos;
varying vec3 v_view_dir;
varying float v_presence;

vec3 read_normal(vec2 tex_coord) {
    vec4 normal_p = texture2D(u_tileset_normal, tex_coord);
    vec3 normal = normal_p.rgb;
    normal = normalize(normal - vec3(.5));
    if (length(normal_p.rgb) == 0.) normal = vec3(0); // bad NaN!
    return normal;
}

float PI = 3.141592653;

void main() {
    vec2 tex_coord = (v_uv + v_tile) / u_tileset_size;
    vec4 color = texture2D(u_tileset, tex_coord);
    color.r = pow(color.r, 1. / 2.2);
    color.g = pow(color.g, 1. / 2.2);
    color.b = pow(color.b, 1. / 2.2);

    if (texture2D(u_tileset_normal, tex_coord).a > 0.) {
        // normal map available -- enable lighting
        vec3 normal = read_normal(tex_coord);
        vec4 albedo = color;

        float light_intensity = 1.;

        color.rgb = normal / 2. + vec3(.5);
        color.rgb = (0.5 + 0.5 * dot(normal, u_light_dir) * light_intensity) * albedo.rgb;
        color.a = albedo.a;
    }

    color.a *= v_presence;

    if (color.a < 0.01) discard;

    gl_FragColor = color;
}
