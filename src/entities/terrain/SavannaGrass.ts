const GrassyTerrainBaseClass = require("../abstract/GrassyTerrain.ts");
const { addEntityClass: addEntityClassSavannaGrass } = require("skele2d");

class SavannaGrass extends GrassyTerrainBaseClass {
	color!: string;
	color_dark!: string;
	color_light!: string;

	constructor() {
		super();
		this.color = "#C29853";
		this.color_dark = "#B7863E";
		this.color_light = "#D6AE77";
	}
}

addEntityClassSavannaGrass(SavannaGrass);

module.exports = SavannaGrass;
