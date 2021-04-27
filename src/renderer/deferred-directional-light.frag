precision highp float;

uniform sampler2D u_albedo;
uniform sampler2D u_normal;
uniform vec3 u_light_dir;
uniform vec4 u_light_color;

varying vec2 v_uv;

void main() {
    vec4 albedo = texture2D(u_albedo, v_uv);
    vec3 normal = texture2D(u_normal, v_uv).xyz;

    vec3 light_color = u_light_color.rgb * u_light_color.w;

    vec4 color = vec4(0);
    color.rgb = albedo.rgb * max(0., dot(normal, normalize(u_light_dir))) * light_color;
    color.a = albedo.a;
    gl_FragColor = color;
}
