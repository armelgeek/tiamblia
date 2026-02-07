const EntityBase = require("./Entity.ts");
const TAU = Math.PI * 2;

interface BranchParams {
	from: string;
	to: string;
	juice: number;
	angle: number;
}

interface Point {
	x: number;
	y: number;
	radius?: number;
	scale_x?: number;
	scale_y?: number;
	color?: string;
	is_leaf?: boolean;
}

interface Segment {
	a: Point;
	b: Point;
	width: number;
	color: string;
}

interface Structure {
	points: { [key: string]: Point };
	segments: { [key: string]: Segment };
	addPoint(name: string): void;
	addSegment(params: { from: string; name: string; length: number; width: number; color: string }): void;
}

class Tree extends EntityBase {
	structure!: Structure;
	bbox_padding!: number;

	constructor() {
		super();
		this.structure.addPoint("base");
		this.bbox_padding = 60;
	}

	initLayout(): void {}

	branch({ from, to, juice, angle }: BranchParams): void {
		const name = to;
		const length = Math.sqrt(juice * 1000) * (Math.random() + 1);
		const width = Math.sqrt(juice * 20) + 1;
		this.structure.addSegment({ from, name, length, width, color: "#926B2E" });
		this.structure.points[name].x = this.structure.points[from].x + Math.sin(angle) * length;
		this.structure.points[name].y = this.structure.points[from].y + Math.cos(angle) * length;
		if (--juice > 0) {
			this.branch({ from: name, to: `${to}-a`, juice, angle: angle + Math.random() * TAU / 8 });
			this.branch({ from: name, to: `${to}-b`, juice, angle: angle - Math.random() * TAU / 8 });
			if (Math.random() < 0.2) {
				this.branch({ from: name, to: `${to}-c`, juice, angle });
			}
		} else {
			const leaf_point = this.structure.points[name];
			this.leaf(leaf_point);
		}
	}

	leaf(leaf: Point): Point {
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
			const leaf = this.structure.points[point_name];
			if (leaf.is_leaf) {
				ctx.beginPath();
				ctx.arc(leaf.x, leaf.y, leaf.radius!, 0, TAU);
				ctx.fillStyle = leaf.color!;
				ctx.fill();
			}
		}
	}
}

module.exports = Tree;
