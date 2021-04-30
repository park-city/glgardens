// Applies the chunk loading animation
void tc_load_anim(in vec2 obj_pos, in vec4 load_anim, inout vec3 world_pos, out float presence) {
    vec2 i_origin = load_anim.xy;
    float i_time = load_anim.z;
    float i_extravagance = load_anim.w;

    float anim_stagger_distance = length(obj_pos - i_origin);

    anim_stagger_distance = 4. * log2(anim_stagger_distance + 3.) - 6.;
    float t = mix(
        5. * -i_time + anim_stagger_distance / 14. + 1.,
        (12. * -i_time + anim_stagger_distance + 3.) / 3.,
        i_extravagance
    );
    float dz = -pow(3., 1.6 * t) + pow(3., 0.7 * t);

    // scale tile a bit
    world_pos.z *= 1. + max(-0.5, dz) * i_extravagance;
    // offset tile a bit
    world_pos.z += dz * (i_extravagance * 0.5 + 0.5);

    presence = mix(
        clamp(1. - t, 0., 1.),
        min(0., max(-1., dz / 4.)) + 1.,
        i_extravagance
    );
}
