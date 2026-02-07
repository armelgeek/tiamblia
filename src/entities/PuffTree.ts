const PuffTreeBase = require("./abstract/Tree.ts");
const { addEntityClass: addPuffTreeEntityClass } = require("skele2d");
const TAU_PUFF = Math.PI * 2;

interface PuffBranchParams {
	from: string;
	to: string;
	juice: number;
	angle: number;
	width: number;
	length: number;
}

interface PuffPoint {
	x: number;
	y: number;
	radius?: number;
	is_leaf?: boolean;
}

class PuffTree extends PuffTreeBase {
	bbox_padding!: number;
	random_index: number = 0;
	random_values: number[] = [];

	constructor() {
		super();

		this.bbox_padding = 60;

		this.random_index = 0;
		this.random_values = [];

		this.branch({
			from: "base",
			to: "1",
			juice: Math.random() * 10 + 5,
			width: 10 + Math.floor(Math.random() * 5),
			length: 9,
			angle: -TAU_PUFF / 4
		});
	}

	random(): number {
		this.random_index++;
		if (this.random_values[this.random_index] === undefined) {
			this.random_values[this.random_index] = Math.random();
		}
		return this.random_values[this.random_index];
	}

	branch({ from, to, juice, angle, width, length }: PuffBranchParams): void {
		const name = to;
		angle += (Math.random() * 2 - 1) * 0.7;
		this.structure.addSegment({ from, name, length, width, color: "#89594A" });
		this.structure.points[name].x = this.structure.points[from].x + Math.cos(angle) * length;
		this.structure.points[name].y = this.structure.points[from].y + Math.sin(angle) * length;
		juice -= 0.3;
		if (juice > 0) {
			this.branch({ from: name, to: `${to}-a`, juice, angle, width: juice, length });
			if (Math.random() < 0.1 - juice / 200) {
				this.branch({ from: name, to: `${to}-b`, juice, angle: angle + (Math.random() - 1 / 2) * TAU_PUFF / 4, width: juice, length });
			}
		} else {
			const leaf_point = this.structure.points[name] as PuffPoint;
			this.leaf(leaf_point);
		}
	}

	leaf(leaf: PuffPoint): PuffPoint {
		leaf.is_leaf = true;
		return leaf;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.random_index = 0;

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
			const leaf = this.structure.points[point_name] as PuffPoint;
			if (leaf.is_leaf) {
				this.drawLeaf(ctx, leaf.x, leaf.y);
			}
		}
	}

	drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number): void {
		ctx.save();
		const l = this.random() / 2;
		ctx.fillStyle = `hsl(${~~(150 - l * 50)},${~~(50)}%,${~~(50 + l * 20)}%)`;
		ctx.beginPath();
		ctx.arc(x, y, 10 + this.random() * 5, 0, TAU_PUFF, true);
		ctx.fill();
		for (let i = 0; i <= 10; i++) {
			const l = this.random() / 2;
			ctx.fillStyle = `hsl(${~~(150 - l * 50)},${~~(50)}%,${~~(50 + l * 20)}%)`;
			ctx.beginPath();
			const r1 = TAU_PUFF * this.random();
			const r2 = this.random() * 15;
			ctx.arc(x + Math.sin(r1) * r2, y + Math.cos(r1) * r2, 5 + this.random() * 5, 0, TAU_PUFF, true);
			ctx.fill();
		}
		ctx.restore();
	}
}

addPuffTreeEntityClass(PuffTree);
module.exports = PuffTree;
