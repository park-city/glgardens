import { BackingContextType, IBackingContext } from './typedefs';

export class BackingCanvas implements IBackingContext {
    node: HTMLDivElement;
    canvas!: HTMLCanvasElement;
    context: WebGL2RenderingContext | WebGLRenderingContext | CanvasRenderingContext2D | null = null;

    get width(): number {
        return this.canvas.width / this.pixelScale;
    }

    get height(): number {
        return this.canvas.height / this.pixelScale;
    }

    get pixelScale(): number {
        return Math.ceil(window.devicePixelRatio);
    }

    constructor() {
        this.node = document.createElement('div');

        window.addEventListener('resize', this.didResize);
    }

    dispose() {
        window.removeEventListener('resize', this.didResize);
    }

    didResize = () => {
        this.canvas.width = this.canvas.offsetWidth * this.pixelScale;
        this.canvas.height = this.canvas.offsetHeight * this.pixelScale;
    };

    recreateCanvas() {
        if (this.canvas) {
            this.node.removeChild(this.canvas);
        }
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.node.appendChild(this.canvas);
        this.didResize();
    }

    createContext(type: BackingContextType): boolean {
        if (!this.canvas || this.context) {
            this.recreateCanvas();
        }

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
        }
        return !!this.context;
    }

    destroyContext() {
        this.context = null;
    }

    isContextLost(): boolean {
        if (!this.context) return true;
        if (this.context instanceof WebGLRenderingContext || (window.WebGL2RenderingContext && this.context instanceof WebGL2RenderingContext)) {
            return this.context.isContextLost();
        }
        return false;
    }
}
