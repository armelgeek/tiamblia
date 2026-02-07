const LushGrassTerrainBase = require("../abstract/GrassyTerrain.ts");
const { addEntityClass: addEntityClassLushGrass } = require("skele2d");

class LushGrass extends LushGrassTerrainBase {
	color!: string;
	color_dark!: string;
	color_light!: string;

	constructor() {
		super();
		this.color = "#4d8e2c";
		this.color_dark = "#46a517";
		this.color_light = "#7fcc37";
	}
}

addEntityClassLushGrass(LushGrass);

module.exports = LushGrass;
