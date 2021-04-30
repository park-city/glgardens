import { WebGLContext } from './typedefs';
import { isWebGL2 } from './gl-utils';
import { GLBuffer } from './gl-buffer';

type BufferInfo = {
    buffer: GLBuffer,
    size: number,
};
type VertexArrayBuffers = {
    attribCount: number,
    elementBuffer: GLBuffer | null,
    buffers: BufferInfo[],
};

export class GLVertexArray {
    gl: WebGLContext;
    array!: WebGLVertexArrayObject | WebGLVertexArrayObjectOES;
    private readonly ext: OES_vertex_array_object | null = null;
    private readonly buffers: VertexArrayBuffers;
    private readonly polyfill;

    constructor(gl: WebGLContext) {
        this.gl = gl;
        this.buffers = {
            attribCount: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
            elementBuffer: null,
            buffers: [],
        };
        if (isWebGL2(gl)) {
            const gl = this.gl as WebGL2RenderingContext;
            const array = gl.createVertexArray();
            if (!array) throw new Error('Failed to allocate vertex array');
            this.array = array;
        } else {
            this.ext = gl.getExtension('OES_vertex_array_object');
            if (this.ext) {
                const array = this.ext.createVertexArrayOES();
                if (!array) throw new Error('Failed to allocate vertex array');
                this.array = array;
            } else {
                this.polyfill = true;
            }
        }
    }

    bind() {
        if (this.ext) {
            this.ext.bindVertexArrayOES(this.array);
        } else if (this.polyfill) {
            this.bindBuffers();
        } else {
            const gl = this.gl as WebGL2RenderingContext;
            gl.bindVertexArray(this.array);
        }
    }

    update(elements: GLBuffer | null, buffers: BufferInfo[]) {
        this.buffers.elementBuffer = elements;
        this.buffers.buffers = buffers;

        if (this.ext) {
            this.ext.bindVertexArrayOES(this.array);
            this.bindBuffers();
            this.ext.bindVertexArrayOES(null);
        } else if (this.polyfill) {
            // nothing to do
        } else {
            const gl = this.gl as WebGL2RenderingContext;
            gl.bindVertexArray(this.array);
            this.bindBuffers();
            gl.bindVertexArray(null);
        }
    }

    draw(mode: GLenum, offset: GLsizei, count: GLintptr) {
        if (this.buffers.elementBuffer) {
            const type = this.buffers.elementBuffer.scalarType;
            if (!type) throw new Error('Non-scalar buffer used as element buffer');
            this.gl.drawElements(mode, count, type, offset);
        } else {
            this.gl.drawArrays(mode, offset, count);
        }
    }

    unbind() {
        if (this.ext) {
            this.ext.bindVertexArrayOES(null);
        } else if (this.polyfill) {
            this.unbindBuffers();
        } else {
            const gl = this.gl as WebGL2RenderingContext;
            gl.bindVertexArray(null);
        }
    }

    dispose() {
        if (this.ext) {
            this.ext.deleteVertexArrayOES(this.array);
        } else if (this.polyfill) {
            // nothing to do
        } else {
            const gl = this.gl as WebGL2RenderingContext;
            gl.deleteVertexArray(this.array);
        }
    }

    private bindBuffers() {
        const { gl, buffers } = this;
        if (buffers.elementBuffer) {
            buffers.elementBuffer.bind();
        } else {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }

        for (let i = 0; i < buffers.attribCount; i++) {
            const buf = buffers.buffers[i];
            if (!buf) {
                gl.disableVertexAttribArray(i);
                continue;
            }
            buf.buffer.bind();
            gl.enableVertexAttribArray(i);
            if (!buf.buffer.scalarType) throw new Error('Non-scalar buffer used as attribute');
            gl.vertexAttribPointer(i, buf.size, buf.buffer.scalarType, false, 0, 0);
        }
    }

    private unbindBuffers() {
        const gl = this.gl;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        for (let i = 0; i < this.buffers.attribCount; i++) {
            gl.disableVertexAttribArray(i);
        }
    }
}
