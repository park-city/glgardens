precision highp float;

uniform sampler2D u_texture;

varying vec2 v_uv;

void main() {
    gl_FragColor = texture2D(u_texture, v_uv);

    // linear to sRGB gamma (approximately)
    gl_FragColor.r = pow(gl_FragColor.r, 2.2);
    gl_FragColor.g = pow(gl_FragColor.g, 2.2);
    gl_FragColor.b = pow(gl_FragColor.b, 2.2);
}
