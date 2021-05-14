import { GLVertexArray } from './gl-vao';
import { GLBuffer, GLBufferType } from './gl-buffer';
import { SharedContextData } from './context';

export const SHARED_QUAD: SharedContextData<GLVertexArray> = {
    name: 'quad',
    init(ctx) {
        const quad = new GLVertexArray(ctx.gl);
        const quadBuffer = new GLBuffer(ctx.gl, GLBufferType.Array);
        quadBuffer.bind();
        quadBuffer.setData(new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1,
        ]));
        quad.bind();
        quad.update(null, [{
            buffer: quadBuffer,
            size: 2,
        }]);
        quad.unbind();

        quad.dispose = () => {
            quadBuffer.dispose();
            GLVertexArray.prototype.dispose.apply(quad, []);
        };

        return quad;
    },
};
