const BowEntity = require("../abstract/Entity.ts");
const { addEntityClass: addBowEntityClass } = require("skele2d");
const TAU_BOW = Math.PI * 2;

class Bow extends BowEntity {
	height: number;
	fistmele: number;
	draw_distance: number;
	structure: any;
	bbox_padding: number;

	constructor() {
		super();

		this.height = 30;
		this.fistmele = 6;

		this.draw_distance = 0;

		this.structure.addPoint("grip");
		this.structure.addSegment({
			from: "grip",
			to: "top",
			name: "upper limb",
			length: 10
		});
		this.structure.addSegment({
			from: "grip",
			to: "bottom",
			name: "lower limb",
			length: 10
		});
		this.structure.addSegment({
			from: "grip",
			name: "serving",
			length: this.fistmele
		});
		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name as keyof typeof this.structure.points];
			point.vx = 0;
			point.vy = 0;
		}

		this.bbox_padding = 20;
	}

	initLayout(): void {
		this.structure.points.serving.x -= this.fistmele;
		this.layout();
	}

	step(_world: any): void {
		this.layout();
	}

	layout(): void {
		const { top, bottom, grip, serving } = this.structure.points;

		const bow_angle = Math.atan2(grip.y - serving.y, grip.x - serving.x) - TAU_BOW / 4;
		top.x = grip.x + this.height / 2 * Math.cos(bow_angle) - this.fistmele * Math.sin(-bow_angle);
		top.y = grip.y + this.height / 2 * Math.sin(bow_angle) - this.fistmele * Math.cos(bow_angle);
		bottom.x = grip.x - this.height / 2 * Math.cos(bow_angle) - this.fistmele * Math.sin(-bow_angle);
		bottom.y = grip.y - this.height / 2 * Math.sin(bow_angle) - this.fistmele * Math.cos(bow_angle);
	}

	draw(ctx: CanvasRenderingContext2D): void {
		const { top, bottom, grip, serving } = this.structure.points;
		ctx.beginPath();
		ctx.moveTo(top.x, top.y);
		ctx.lineTo(serving.x, serving.y);
		ctx.lineTo(bottom.x, bottom.y);
		ctx.lineWidth = 0.5;
		ctx.lineCap = "round";
		ctx.strokeStyle = "white";
		ctx.stroke();
		ctx.beginPath();
		const bow_angle = Math.atan2(grip.y - serving.y, grip.x - serving.x) - TAU_BOW / 4;
		ctx.save();
		ctx.translate(grip.x, grip.y);
		ctx.rotate(bow_angle);
		const arc_r = this.fistmele;

		ctx.beginPath();
		ctx.save();
		ctx.translate(0, -arc_r);

		ctx.save();
		ctx.scale(this.height / 2 / arc_r + 0.1, 1);
		ctx.arc(0, -0.5, arc_r, 0, TAU_BOW / 2);
		ctx.restore();

		ctx.save();
		ctx.scale(this.height / 2 / arc_r, 0.7);
		ctx.arc(0, 0, arc_r - 0.1, TAU_BOW / 2, 0, true);
		ctx.restore();

		ctx.closePath();

		ctx.fillStyle = "#AB7939";
		ctx.fill();

		ctx.restore();
		ctx.restore();
	}
}

addBowEntityClass(Bow);

module.exports = Bow;
