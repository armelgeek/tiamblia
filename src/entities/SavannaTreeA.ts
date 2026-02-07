const SavannaTreeABase = require("./abstract/Tree.ts");
const { addEntityClass: addSavannaTreeAEntityClass } = require("skele2d");
const TAU_SAVANNA = Math.PI * 2;

interface SavannaPoint {
	x: number;
	y: number;
	radius?: number;
	scale_x?: number;
	scale_y?: number;
	color?: string;
	is_leaf?: boolean;
}

class SavannaTreeA extends SavannaTreeABase {
	constructor() {
		super();
		this.branch({ from: "base", to: "1", juice: 5, angle: -TAU_SAVANNA / 2 });
	}

	leaf(leaf: SavannaPoint): SavannaPoint {
		leaf.radius = Math.random() * 15 + 15;
		leaf.scale_x = 2;
		leaf.scale_y = 1;
		leaf.color = "#627318";
		leaf.is_leaf = true;
		return leaf;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		for (const segment_name in this.structure.segments) {
			const segment = this.structure.segments[segment_name];
			ctx.beginPath();
			ctx.moveTo(segment.a.x, segment.a.y);
			ctx.lineTo(segment.b.x, segment.b.y);
			ctx.lineWidth = segment.width;
			ctx.lineCap = "round";
			ctx.strokeStyle = segment.color;
			ctx.stroke();
		}

		for (const point_name in this.structure.points) {
			const leaf = this.structure.points[point_name] as SavannaPoint;
			if (leaf.is_leaf) {
				ctx.save();
				ctx.beginPath();
				ctx.translate(leaf.x, leaf.y);
				ctx.scale(leaf.scale_x!, leaf.scale_y!);
				ctx.arc(0, 0, leaf.radius!, 0, TAU_SAVANNA);
				ctx.fillStyle = leaf.color!;
				ctx.fill();
				ctx.restore();
			}
		}
	}
}

addSavannaTreeAEntityClass(SavannaTreeA);
module.exports = SavannaTreeA;
