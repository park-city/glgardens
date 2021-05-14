import React from "react"
import TouchControls from "../components/touchcontrols"
import Renderer from "../components/renderer"

class HomePage extends React.Component {
	render() {
		return <div>
			<TouchControls></TouchControls>
			<Renderer></Renderer>
		</div>
	}
}

export default HomePage
