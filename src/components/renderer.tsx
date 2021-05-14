import React from "react"
import { CentralPark } from '../maplist';
import { BackingCanvas } from './backing-canvas'
import { NetgardensWebGLRenderer } from "../renderer";

import { PlaneSubspace } from '../renderer/geom-utils';
import { mat4, quat, vec3, vec4 } from 'gl-matrix';

class Renderer extends React.Component
{
	canvas: any;
	renderer: NetgardensWebGLRenderer;

	constructor(props) {
		super(props);
		this.canvas = React.createRef();
	}

	// determine what the device is capable of
	getCaps() {
		const c = document.createElement('canvas');
		const cgl2 = c.getContext('webgl2');
		const hasWebGL2 = !!cgl2;
		const hasFloatFBO = !!(cgl2 && (cgl2.getExtension('EXT_color_buffer_float')
			|| cgl2.getExtension('EXT_color_buffer_half_float')));

		return {
			type: hasWebGL2 ? 'gl2' : 'gl1',
			float: hasFloatFBO,
			useFloatNormals: false,
			useLinearNormals: false,
			// super laggy on android. works fine everywhere else it seems
			enablePointLights: !navigator.userAgent.includes('Android'),

			debugType: 'normal',
		};
	}

	makeRenderer() {
		let caps = this.getCaps();
		let map = CentralPark; // TODO: Make dynamic!

		//this.renderer = new NetgardensWebGLRenderer(this.canvas.current, null, caps);
		//this.renderer.render();
	};

	render() { 
		return <BackingCanvas ref={this.canvas}></BackingCanvas>
	}

	/*render() {
		return <div>Hello!</div>
	}*/

	// initialization stuff
	componentDidMount() {
		this.makeRenderer();
	}
}

export default Renderer;
