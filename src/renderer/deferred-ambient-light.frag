precision highp float;

uniform sampler2D u_albedo;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec4 u_light_color;

varying vec2 v_uv;

void main() {
    vec4 albedo = texture2D(u_albedo, v_uv);
    vec3 light_color = u_light_color.rgb * u_light_color.w;

    gl_FragColor = vec4(albedo.rgb * light_color, albedo.a);
}
