import React from "react"
import dynamic from 'next/dynamic'
import TouchControls from "../components/touchcontrols"
const Renderer = dynamic(
	() => import("../components/renderer"),
	{ ssr: false }
);

class HomePage extends React.Component {
	render() {
		return <div>
			<TouchControls></TouchControls>
			<Renderer></Renderer>
		</div>
	}
}

export default HomePage
