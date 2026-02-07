const CloudEntity = require("./abstract/Entity.coffee");
const { addEntityClass: addCloudEntityClass } = require("skele2d");

declare const SimplexNoise: any;
const TAU_CLOUD = Math.PI * 2;

class Cloud extends CloudEntity {
	width: number;
	height: number;
	simplex: any;
	t: number;
	intangible: boolean;

	constructor() {
		super();
		this.structure.addPoint("body");

		this.bbox_padding = 80;

		this.width = 45 + Math.random() * 50;
		this.height = 35 + Math.random() * 10;
		this.simplex = new SimplexNoise();
		this.t = 0;
		this.intangible = true;
	}

	toJSON(): any {
		const def: any = {};
		for (const k in this) {
			if (k !== "simplex" && k !== "intangible") {
				def[k] = (this as any)[k];
			}
		}
		return def;
	}

	step(_world: any): void {
		this.x++;
		this.t += 0.001;
		// if @x > terrain.width+300
		// 	@poof=true
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.fillStyle = "#A9D9FA";
		for (let i = 0; i <= 20; i++) {
			ctx.beginPath();
			ctx.arc(
				this.simplex.noise2D(5 + i, this.t + i * 3.92) * this.width + this.width / 2,
				this.simplex.noise2D(26 + i, this.t + i * 2.576) * this.height + this.height / 2,
				Math.abs(this.simplex.noise2D(73 + i * 5.2, this.t + i) * this.width),
				// @simplex.noise2D(68+i,@t)*-TAU_CLOUD,
				// @simplex.noise2D(20+i,@t)*TAU_CLOUD,
				0, TAU_CLOUD,
				false
			);
			ctx.fill();
		}
	}
}

addCloudEntityClass(Cloud);
module.exports = Cloud;
