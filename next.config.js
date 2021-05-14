module.exports = {
	webpack: (config, options) => {
		config.module.rules.push({
			test: /\.(glsl|vs|fs|vert|frag)$/,
			exclude: /node_modules/,
			use: [
				'./glsl-loader',
			]
		})

		return config
	},
	future: {
		webpack5: true,
	},
}
