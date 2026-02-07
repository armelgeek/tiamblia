const RockTerrainBase = require("../abstract/Terrain.ts");
const { addEntityClass: addEntityClassRock } = require("skele2d");

interface Point {
	x: number;
	y: number;
}

interface Structure {
	points: { [key: string]: Point };
}

interface View {
	center_x: number;
	center_y: number;
	scale: number;
}

class Rock extends RockTerrainBase {
	bbox_padding!: number;
	structure!: Structure;

	constructor() {
		super();
		this.bbox_padding = 20;
	}

	draw(ctx: CanvasRenderingContext2D, _view: View): void {
		ctx.beginPath();
		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name];
			ctx.lineTo(point.x, point.y);
		}
		ctx.closePath();
		ctx.fillStyle = "#63625F";
		ctx.fill();
	}
}

addEntityClassRock(Rock);

module.exports = Rock;
