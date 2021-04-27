precision highp float;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_chunk;
uniform vec3 u_camera_pos;
uniform vec4 u_in_anim;
attribute vec3 a_position;
attribute vec2 a_obj_pos;
attribute vec2 a_uv;
attribute vec2 a_tile;

varying vec2 v_uv;
varying vec2 v_tile;
varying vec4 v_world_pos;
varying vec3 v_view_dir;
varying float v_presence;

void main() {
    vec4 pos = vec4(a_position, 1.);
    v_uv = a_uv;
    v_tile = a_tile;
    v_world_pos = u_chunk * pos;
    v_view_dir = normalize(u_camera_pos - v_world_pos.xyz);

    {
        vec2 u_in_origin = u_in_anim.xy;
        float u_in_time = u_in_anim.z;
        float u_in_extravagance = u_in_anim.w;

        float anim_stagger_distance = length((u_chunk * vec4(a_obj_pos, 0, 1)).xy - u_in_origin);

        anim_stagger_distance = 4. * log2(anim_stagger_distance + 3.) - 6.;
        float t = mix(
            5. * -u_in_time + anim_stagger_distance / 14. + 1.,
            (12. * -u_in_time + anim_stagger_distance + 3.) / 3.,
            u_in_extravagance
        );
        float dz = -pow(3., 1.6 * t) + pow(3., 0.7 * t);

        // scale tile a bit
        v_world_pos.z *= 1. + max(-0.5, dz) * u_in_extravagance;
        // offset tile a bit
        v_world_pos.z += dz * (u_in_extravagance * 0.5 + 0.5);

        v_presence = mix(
            clamp(1. - t, 0., 1.),
            min(0., max(-1., dz / 4.)) + 1.,
            u_in_extravagance
        );
    }

    gl_Position = u_proj * u_view * v_world_pos;
}
