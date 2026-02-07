GrassyTerrain = require("../abstract/GrassyTerrain.ts")
{addEntityClass} = require("skele2d")

module.exports = class SavannaGrass extends GrassyTerrain
	addEntityClass(@)
	constructor: ->
		super()
		@color = "#C29853"
		@color_dark = "#B7863E"
		@color_light = "#D6AE77"
