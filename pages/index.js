import React from "react"

class TouchControls extends React.Component {
	render() { return 
	<div>
		<div>
			<button id="zoom-out">zoom out</button>
			<button id="zoom-in">zoom in</button>
			<button id="persp">persp</button>
		</div>
		<div>
			<button id="up">up</button>
			<button id="down">down</button>
		</div>
		<div>
			<button id="rleft">&lt;</button>
			<button id="rup">^</button>
			<button id="rdown">v</button>
			<button id="rright">&gt;</button>
		</div>
	</div>
	}
}

class Index extends React.Component {
	render() {
		return <div>Welcome to NextJS!</div>
	}
}

export default Index