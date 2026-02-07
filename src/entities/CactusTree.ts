const CactusTreeBase = require("./abstract/Tree.ts");
const { addEntityClass: addCactusTreeEntityClass } = require("skele2d");
const TAU_CACTUS = Math.PI * 2;

interface CactusBranchParams {
	from: string;
	to: string;
	juice: number;
	width: number;
	length: number;
	angle: number;
	offshoots: number;
}

interface CactusPoint {
	x: number;
	y: number;
	radius?: number;
	is_leaf?: boolean;
}

class CactusTree extends CactusTreeBase {
	bbox_padding!: number;
	random_index: number = 0;
	random_values: number[] = [];

	constructor() {
		super();

		this.bbox_padding = 30;

		this.random_index = 0;
		this.random_values = [];

		this.branch({
			from: "base",
			to: "1",
			juice: Math.random() * 10 + 3,
			width: 10 + Math.floor(Math.random() * 5),
			length: 15,
			angle: -TAU_CACTUS / 4,
			offshoots: 0
		});
	}

	random(): number {
		this.random_index++;
		if (this.random_values[this.random_index] === undefined) {
			this.random_values[this.random_index] = Math.random();
		}
		return this.random_values[this.random_index];
	}

	branch({ from, to, juice, angle, width, length, offshoots }: CactusBranchParams): void {
		const name = to;
		this.structure.addSegment({ from, name, length, width, color: "green" });
		this.structure.points[name].x = this.structure.points[from].x + Math.cos(angle) * length;
		this.structure.points[name].y = this.structure.points[from].y + Math.sin(angle) * length;
		juice -= 1;
		if (offshoots > 0) {
			width *= 0.97;
		} else if (juice < 3) {
			width *= 0.9;
		} else if (juice > 5) {
			width *= 1.1;
		}
		if (juice > 0) {
			const dir = { x: Math.cos(angle), y: Math.sin(angle) };
			dir.y -= 3;
			angle = Math.atan2(dir.y, dir.x);
			const max_branches = 5;
			let offshoots_here = 0;
			if (Math.random() < 0.5 && offshoots < max_branches && juice > 3) {
				offshoots_here = 2;
				if (Math.random() < 0.1 || offshoots + offshoots_here > max_branches) {
					offshoots_here = 1;
				}
			}
			const offshoot_names = ["b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
			const starting_side = Math.random() < 0.5 ? 1 : -1;
			if (offshoots_here) {
				for (let i = 0; i < offshoots_here; i++) {
					const offshoot_name = offshoot_names[i];
					const branch_juice = juice / 3;
					let branch_width = width * 0.7;
					let branch_length = length;
					for (let j = 0; j < offshoots; j++) {
						branch_length *= 0.9;
					}
					const side = starting_side * (i % 2 ? 1 : -1);
					const branch_angle = angle + TAU_CACTUS / 5 * side;
					this.branch({ from: name, to: `${to}-${offshoot_name}`, juice: branch_juice, angle: branch_angle, width: branch_width, length: branch_length, offshoots: offshoots + offshoots_here });
				}
				width *= 0.8;
			}
			this.branch({ from: name, to: `${to}-a`, juice, angle, width, length, offshoots: offshoots + offshoots_here });
		} else {
			const leaf_point = this.structure.points[name] as CactusPoint;
			leaf_point.radius = width / 2;
			this.leaf(leaf_point);
		}
	}

	leaf(leaf: CactusPoint): CactusPoint {
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
			// Highlights
			ctx.lineWidth = segment.width * 0.1;
			ctx.lineCap = "round";
			ctx.strokeStyle = "rgba(255,255,100,0.5)";
			const angle = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x) + TAU_CACTUS / 4;
			const dir = { x: segment.b.x - segment.a.x, y: segment.b.y - segment.a.y };
			const length = Math.hypot(dir.x, dir.y);
			dir.x /= length;
			dir.y /= length;
			const perp = { x: -dir.y, y: dir.x };
			const i_to = 0.8;
			const i_from = -i_to;
			const lines = 4;
			for (let i = i_from; i <= i_to; i += (i_to - i_from) / lines) {
				ctx.save();
				const o = (segment.width / 2 - ctx.lineWidth / 2) * i;
				const lengthen = segment.width / 2 * Math.sqrt(1 - i * i) - ctx.lineWidth / 2;
				const bulge = segment.width * 0.1;
				ctx.translate(Math.cos(angle) * o, Math.sin(angle) * o);
				ctx.beginPath();
				ctx.moveTo(segment.a.x - dir.x * lengthen, segment.a.y - dir.y * lengthen);
				ctx.bezierCurveTo(
					segment.a.x + perp.x * bulge * i, segment.a.y + perp.y * bulge * i,
					segment.b.x + perp.x * bulge * i, segment.b.y + perp.y * bulge * i,
					segment.b.x + dir.x * lengthen, segment.b.y + dir.y * lengthen
				);
				ctx.stroke();
				ctx.restore();
			}
			// Shadow
			ctx.lineWidth = segment.width / 2;
			ctx.lineCap = "round";
			ctx.strokeStyle = "rgba(0,120,0,0.5)";
			ctx.beginPath();
			const ox = -segment.width / 4;
			const oy = segment.width / 6;
			ctx.moveTo(segment.a.x + ox, segment.a.y + oy);
			ctx.lineTo(segment.b.x + ox, segment.b.y + oy);
			ctx.stroke();
			ctx.globalCompositeOperation = "source-over";
			// Main Highlight
			ctx.lineWidth = segment.width / 2;
			ctx.lineCap = "round";
			ctx.strokeStyle = "rgba(255,255,100,0.2)";
			ctx.beginPath();
			const ox2 = segment.width / 4;
			const oy2 = -segment.width / 6;
			ctx.moveTo(segment.a.x + ox2, segment.a.y + oy2);
			ctx.lineTo(segment.b.x + ox2, segment.b.y + oy2);
			ctx.stroke();
		}

		for (const point_name in this.structure.points) {
			const leaf = this.structure.points[point_name] as CactusPoint;
			if (leaf.is_leaf) {
				this.drawLeaf(ctx, leaf);
			}
		}
	}

	drawLeaf(ctx: CanvasRenderingContext2D, { x, y, radius = 5 }: CactusPoint): void {
		// draw flowers
		for (let i = 0; i <= 2 + this.random() * 3; i++) {
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(this.random() * TAU_CACTUS / 2 + TAU_CACTUS / 2);
			ctx.beginPath();
			ctx.translate(this.random() * radius, 0);
			ctx.moveTo(0, 0);
			ctx.translate(this.random() * radius, 0);
			ctx.lineTo(0, 0);
			ctx.lineWidth = 0.5;
			ctx.strokeStyle = "salmon";
			ctx.stroke();
			ctx.scale(0.5 + this.random() * 0.5, 1);
			ctx.beginPath();
			ctx.arc(0, 0, 2, 0, TAU_CACTUS, true);
			ctx.fillStyle = "pink";
			ctx.fill();
			ctx.restore();
		}
	}
}

addCactusTreeEntityClass(CactusTree);
module.exports = CactusTree;
