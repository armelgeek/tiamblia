const WaterTerrainBase = require("../abstract/Terrain.ts");
const { addEntityClass: addEntityClassWater } = require("skele2d");
const { distanceToLineSegment } = require("skele2d").helpers;

interface Point {
	x: number;
	y: number;
}

interface Segment {
	a: Point;
	b: Point;
}

interface Structure {
	points: { [key: string]: Point };
	segments: { [key: string]: Segment };
	onchange?: () => void;
	pointInPolygon(point: Point): boolean;
}

interface View {
	center_x: number;
	center_y: number;
	scale: number;
	fromWorld(point: Point): Point;
}

interface Bubble {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	life: number;
}

function closestPointOnLineSegment(point: Point, a: Point, b: Point): Point {
	// https://stackoverflow.com/a/3122532/2624876
	const a_to_p = { x: point.x - a.x, y: point.y - a.y };
	const a_to_b = { x: b.x - a.x, y: b.y - a.y };
	const atb2 = a_to_b.x ** 2 + a_to_b.y ** 2;
	const atp_dot_atb = a_to_p.x * a_to_b.x + a_to_p.y * a_to_b.y;
	const t = atp_dot_atb / atb2;
	return { x: a.x + a_to_b.x * t, y: a.y + a_to_b.y * t };
}

class Water extends WaterTerrainBase {
	bbox_padding!: number;
	solid!: boolean;
	waves_y!: number[];
	waves_vy!: number[];
	min_x!: number;
	max_x!: number;
	min_y!: number;
	max_y!: number;
	ccw!: boolean;
	bubbles!: Bubble[];
	structure!: Structure;
	x!: number;
	y!: number;

	constructor() {
		super();
		this.bbox_padding = 30;
		this.solid = false;
		this.waves_y = [];
		this.waves_vy = [];
		this.min_x = Infinity;
		this.max_x = -Infinity;
		this.min_y = Infinity;
		this.max_y = -Infinity;
		this.structure.onchange = () => {
			this.waves_y = [];
			this.waves_vy = [];
			this.min_x = Infinity;
			this.max_x = -Infinity;
			this.min_y = Infinity;
			this.max_y = -Infinity;
			for (const point_name in this.structure.points) {
				const point = this.structure.points[point_name];
				this.min_x = Math.min(this.min_x, point.x);
				this.max_x = Math.max(this.max_x, point.x);
				this.min_y = Math.min(this.min_y, point.y);
				this.max_y = Math.max(this.max_y, point.y);
			}
			this.min_x = Math.floor(this.min_x);
			this.max_x = Math.ceil(this.max_x);
			this.min_y = Math.floor(this.min_y);
			this.max_y = Math.ceil(this.max_y);

			for (let x = this.min_x; x < this.max_x; x++) {
				this.waves_y[x - this.min_x] = 0;
				this.waves_vy[x - this.min_x] = 0;
			}

			// detect polygon vertex order
			let double_area = 0;
			for (const segment_name in this.structure.segments) {
				const segment = this.structure.segments[segment_name];
				double_area += (segment.b.x - segment.a.x) * (segment.b.y + segment.a.y);
			}
			this.ccw = double_area > 0;
		};
		this.bubbles = [];
	}

	toJSON(): any {
		const def: any = {};
		const superDef = super.toJSON();
		for (const k in superDef) {
			if (!["ccw", "min_x", "max_x", "min_y", "max_y"].includes(k)) {
				def[k] = superDef[k];
			}
		}
		return def;
	}

	fromWorld(world_pos: Point): Point {
		return { x: world_pos.x - this.x, y: world_pos.y - this.y };
	}

	makeWaves(world_pos: Point, radius: number = 5, velocity_y: number = 5): void {
		const local_pos = this.fromWorld(world_pos);
		for (let x = Math.round(local_pos.x - radius); x < Math.round(local_pos.x + radius); x++) {
			this.waves_vy[x - this.min_x] = velocity_y * (1 - Math.abs(x - local_pos.x) / radius);
		}
		for (let i = 0; i <= Math.min(20, radius * Math.abs(velocity_y)); i++) {
			const angle = Math.random() * Math.PI * 2;
			this.bubbles.push({
				x: local_pos.x + Math.cos(angle) * radius,
				y: (this.waves_vy[Math.round(local_pos.x) - this.min_x] ?? 0) + this.min_y,
				vx: Math.cos(angle) * (1 * Math.random()),
				vy: Math.sin(angle) * (1 * Math.random()) + Math.min(10, Math.abs(velocity_y / 3)),
				radius: Math.random() * 2,
				life: Math.random() * 100 + 10,
			});
		}
	}

	step(): void {
		const neighboring: number[] = [];
		for (let x = this.min_x; x < this.max_x; x++) {
			neighboring[x - this.min_x] =
				(this.waves_y[x - this.min_x - 1] ?? 0) + (this.waves_y[x - this.min_x + 1] ?? 0);
		}
		for (let x = this.min_x; x < this.max_x; x++) {
			this.waves_vy[x - this.min_x] += (neighboring[x - this.min_x] - this.waves_y[x - this.min_x] * 2) * 0.4;
			this.waves_vy[x - this.min_x] *= 0.99;
			this.waves_vy[x - this.min_x] -= this.waves_y[x - this.min_x] * 0.2;
			this.waves_y[x - this.min_x] += this.waves_vy[x - this.min_x];
		}

		for (let i = this.bubbles.length - 1; i >= 0; i--) {
			const bubble = this.bubbles[i];
			bubble.life -= 1;
			bubble.x += bubble.vx;
			bubble.y += bubble.vy;
			const waves_x = Math.round(bubble.x) - this.min_x;
			if (this.waves_y[waves_x] !== undefined) {
				bubble.vy += (this.waves_vy[waves_x] ?? 0) * 0.1;
				bubble.vy -= 0.3;
				bubble.vy += (Math.max(bubble.y, this.waves_y[waves_x] + this.min_y) - bubble.y) * 0.4;
				bubble.y = Math.max(bubble.y, this.waves_y[waves_x] + this.min_y);
			} else {
				bubble.life -= 2;
				bubble.vx *= 0.5;
				bubble.vy *= 0.5;
			}

			// constrain to polygon, taking into account dynamic waves
			if (!this.structure.pointInPolygon(bubble)) {
				if (!this.structure.pointInPolygon({ x: bubble.x, y: bubble.y + (this.waves_y[waves_x] ?? 0) })) {
					let closest_distance = Infinity;
					let closest_segment: Segment | null = null;
					for (const segment_name in this.structure.segments) {
						const segment = this.structure.segments[segment_name];
						const dist = distanceToLineSegment(bubble, segment.a, segment.b);
						if (dist < closest_distance) {
							closest_distance = dist;
							closest_segment = segment;
						}
					}
					if (closest_segment) {
						const closest_point = closestPointOnLineSegment(bubble, closest_segment.a, closest_segment.b);
						bubble.x = closest_point.x;
						if (bubble.y < this.min_y) {
							closest_point.y += this.waves_y[waves_x] ?? 0;
							closest_point.y = Math.max(closest_point.y, bubble.y);
						}
						bubble.y = closest_point.y;
					}
				}
			}

			// pop bubble
			if (bubble.life <= 0) {
				this.bubbles.splice(i, 1);
			}
		}
	}

	draw(ctx: CanvasRenderingContext2D, view: View): void {
		const wave_center_y = this.min_y;
		ctx.save();
		ctx.beginPath();
		for (let x = this.min_x; x < this.max_x; x++) {
			ctx.lineTo(x, this.waves_y[x - this.min_x] + wave_center_y);
		}
		ctx.lineTo(this.max_x, this.max_y);
		ctx.lineTo(this.min_x, this.max_y);
		ctx.closePath();
		ctx.clip();

		ctx.beginPath();
		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name];
			if (point.y < wave_center_y + 2) {
				if ((point.x > (this.min_x + this.max_x) / 2) === this.ccw) {
					ctx.lineTo(point.x, point.y);
					ctx.lineTo(point.x, point.y - 50);
				} else {
					ctx.lineTo(point.x, point.y - 50);
					ctx.lineTo(point.x, point.y);
				}
			} else {
				ctx.lineTo(point.x, point.y);
			}
		}
		ctx.closePath();
		ctx.fillStyle = "hsla(200, 100%, 50%, 0.5)";
		ctx.fill();

		ctx.clip();

		// Draw reflections by drawing the canvas upside down on top of itself

		// Undo the entity space transform
		ctx.translate(-this.x, -this.y);
		// Undo the view transform
		ctx.translate(view.center_x, view.center_y);
		ctx.scale(1 / view.scale, 1 / view.scale);
		ctx.translate(-ctx.canvas.width / 2, -ctx.canvas.height / 2);
		// We're now in canvas space

		// We need to know the y coordinate of the reflecting line in canvas space
		const reflecting_line_y = (this.y + wave_center_y - view.center_y) * view.scale + ctx.canvas.height / 2;

		ctx.globalAlpha = 0.2;
		ctx.translate(0, reflecting_line_y * 2);
		ctx.scale(1, -1);

		// Optimization: draw only the part of the canvas that's visible
		const bbox_min = view.fromWorld({ x: this.min_x + this.x, y: this.min_y + this.y });
		const bbox_max = view.fromWorld({ x: this.max_x + this.x, y: this.max_y + this.y });
		// Invert the y coordinates over the reflecting line
		bbox_min.y = reflecting_line_y * 2 - bbox_min.y;
		bbox_max.y = reflecting_line_y * 2 - bbox_max.y;
		ctx.drawImage(
			ctx.canvas,
			bbox_min.x,
			bbox_min.y,
			bbox_max.x - bbox_min.x,
			bbox_max.y - bbox_min.y,
			bbox_min.x,
			bbox_min.y,
			bbox_max.x - bbox_min.x,
			bbox_max.y - bbox_min.y
		);

		ctx.restore();

		this.draw_bubbles(ctx, view);
	}

	draw_bubbles(ctx: CanvasRenderingContext2D, _view: View): void {
		for (const bubble of this.bubbles) {
			ctx.save();
			ctx.translate(bubble.x, bubble.y);
			ctx.beginPath();
			ctx.arc(0, 0, bubble.radius, 0, Math.PI * 2);
			ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
			ctx.fill();
			ctx.restore();
		}
	}
}

addEntityClassWater(Water);

module.exports = Water;
