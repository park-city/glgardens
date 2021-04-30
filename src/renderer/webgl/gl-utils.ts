import { WebGLContext } from './typedefs';

/** Sets the blending function to normal straight alpha blending. */
export function setNormalAlphaBlending(gl: WebGLContext) {
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

export function isWebGL2(gl: WebGLContext): boolean {
    return window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext;
}
