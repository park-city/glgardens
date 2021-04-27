precision highp float;

uniform sampler2D u_position;
uniform sampler2D u_albedo;
uniform sampler2D u_normal;
uniform vec3 u_light_pos;
uniform vec4 u_light_color;
uniform vec2 u_viewport_size;

varying vec2 v_pos;

void main() {
    vec2 v_uv = gl_FragCoord.xy / u_viewport_size;
    if (length(v_pos - vec2(0.5)) > 0.5) discard;

    vec3 world_pos = texture2D(u_position, v_uv).xyz;
    vec4 albedo = texture2D(u_albedo, v_uv);
    vec3 normal = texture2D(u_normal, v_uv).xyz;

    vec3 light_dir = normalize(u_light_pos - world_pos);
    float light_intensity = 10. * u_light_color.w / pow(length(u_light_pos - world_pos), 2.);

    // soft edge instead of cutting off the light shape
    light_intensity *= 1. - exp(5. * (length(v_pos - vec2(0.5)) * 2. - 1.));

    vec3 light_color = light_intensity * u_light_color.rgb;

    vec4 color = vec4(0);
    color.rgb = albedo.rgb * max(0., dot(normal, light_dir)) * light_color;
    color.a = albedo.a;
    gl_FragColor = color;
}
