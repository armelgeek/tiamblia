const ArcheryTargetEntity = require("../abstract/Entity.coffee");
const { addEntityClass: addArcheryTargetEntityClass } = require("skele2d");
const TAU_TARGET = Math.PI * 2;

class ArcheryTarget extends ArcheryTargetEntity {
	structure: any;
	bbox_padding: number;

	constructor() {
		super();

		this.structure.addPoint("a");
		this.structure.addSegment({
			from: "a",
			to: "b",
			name: "target",
			length: 100
		});
		this.bbox_padding = 20;
	}

	initLayout(): void {
		this.structure.points.b.y += 100;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		const { a, b } = this.structure.points;
		const diameter = Math.hypot(b.x - a.x, b.y - a.y);
		const radius = diameter / 2;
		const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		ctx.save();
		ctx.translate(center.x, center.y);
		ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
		ctx.scale(1, 1 / 3);
		// Draw concentric circles
		const colors = ["#fff", "#000", "#0af", "#f00", "#ff0"];
		for (let i = 0; i < colors.length; i++) {
			const color = colors[i];
			ctx.beginPath();
			ctx.arc(0, 0, (1 - i / colors.length) * radius, 0, TAU_TARGET);
			ctx.fillStyle = color;
			ctx.fill();
		}
		ctx.restore();
	}
}

addArcheryTargetEntityClass(ArcheryTarget);

module.exports = ArcheryTarget;
