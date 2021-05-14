import glsl from 'glslify';

export const compositeVert = glsl.file('./composite.vert');
export const compositeBloomThresFrag = glsl.file('./composite-bloom-thres.frag');
export const compositeBloomBlurFrag = glsl.file('./composite-bloom-blur.frag');
export const compositeBloomFinalFrag = glsl.file('./composite-bloom-final.frag');
export const compositeFinalFrag = glsl.file('./composite-final.frag');
export const tileChunkVert = glsl.file('./tile-chunk.vert');
export const tileChunkFrag = glsl.file('./tile-chunk.frag');
