import React from "react"
import { BackingContextType } from '../renderer/typedefs';

/**
 * A backing context that uses an HTML canvas. The canvas may be destroyed and recreated, so there's
 * a wrapper div around it.
 */
export class BackingCanvas extends React.Component {
    /** The wrapper div around the canvas. */
    canvas!: HTMLCanvasElement;
    context: WebGL2RenderingContext | WebGLRenderingContext | CanvasRenderingContext2D | null = null;
    maxPixelScale = 2;

    /** dynamic properties **/
    get width(): number {
        return this.canvas.width / this.pixelScale;
    }
    get height(): number {
        return this.canvas.height / this.pixelScale;
    }
    get pixelScale(): number {
        return Math.min(this.maxPixelScale, Math.ceil(window.devicePixelRatio));
    }

    render() {
        return <div>
            <canvas width="100%" height="100%"></canvas>
        </div>
    }

    /**
     * Resizes the canvas to fit. Call this method when the node is resized. Window resizes are
     * handled automatically.
     */
    didResize() {
        this.canvas.width = this.canvas.offsetWidth * this.pixelScale;
        this.canvas.height = this.canvas.offsetHeight * this.pixelScale;
    };
    componentDidMount() {
        window.addEventListener('resize', this.didResize);
    };

    /** Recreates the canvas context. **/
    createContext(type: BackingContextType): boolean {
        switch (type) {
            case BackingContextType.Canvas2D:
                this.context = this.canvas.getContext('2d');
                break;
            case BackingContextType.WebGL:
                this.context = this.canvas.getContext('webgl');
                break;
            case BackingContextType.WebGL2OrWebGL:
                this.context = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
                break;
            default:
                throw new Error('context type not supported');
        }

        return !!this.context;
    }

    isContextLost(): boolean {
        if (!this.context) return true;
        if (this.context instanceof WebGLRenderingContext || (window.WebGL2RenderingContext && this.context instanceof WebGL2RenderingContext)) {
            return this.context.isContextLost();
        }
        return false;
    }
}
export default BackingCanvas;
