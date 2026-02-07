const GranddaddyLonglegsEntity = require("./abstract/Entity.ts");
const { addEntityClass: addGranddaddyLonglegsEntityClass } = require("skele2d");
const granddaddyLonglegsHelpers = require("skele2d").helpers;
const TAU_GRANDDADDYLONGLEGS = Math.PI * 2;

interface Point {
	x: number;
	y: number;
	name?: string;
	vx?: number;
	vy?: number;
}

interface Leg {
	point_names_by_segment_name: { [key: string]: string };
	foot_point_name: string;
}

interface World {
	collision: (params: any, options?: any) => any;
}

class GranddaddyLonglegs extends GranddaddyLonglegsEntity {
	foot_point_names: string[];
	legs: Leg[];
	step_index: number;
	step_timer: number;
	next_foot_positions: { [key: string]: { x: number; y: number } };

	constructor() {
		super();
		this.structure.addPoint("body");
		this.foot_point_names = [];
		this.legs = [];
		for (let leg_pair_n = 1; leg_pair_n <= 4; leg_pair_n++) {
			for (const side of ["left", "right"]) {
				const leg: Leg = { point_names_by_segment_name: {}, foot_point_name: "" };
				this.legs.push(leg);
				let previous = "body";
				for (const segment_name of ["upper", "middle", "lower"]) {
					const point_name =
						segment_name === "lower"
							? `${side} foot ${leg_pair_n}`
							: `${segment_name} ${side} leg ${leg_pair_n}`;
					const foot_point_name = segment_name === "lower" ? point_name : undefined;
					previous = this.structure.addSegment({
						from: previous,
						to: foot_point_name,
						name: `${segment_name} ${side} leg ${leg_pair_n}`,
						length: 50,
						// NOTE: opiliones (harvestmen) (granddaddy longlegses) (granddaddies-longlegs?))
						// often have vastly more spindly legs
						width: segment_name === "upper" ? 4 : segment_name === "middle" ? 3 : 2
					});
					leg.point_names_by_segment_name[segment_name] = point_name;
					if (segment_name === "lower") {
						leg.foot_point_name = point_name;
						this.foot_point_names.push(point_name);
					}
				}
			}
		}

		this.step_index = 0;
		this.step_timer = 0;
		this.next_foot_positions = {};
		for (const point_name of this.foot_point_names) {
			this.next_foot_positions[point_name] = { x: 0, y: 0 };
		}

		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name];
			point.vx = 0;
			point.vy = 0;
		}

		this.bbox_padding = 20;
	}

	step(world: World): void {
		if (this.toWorld(this.structure.points[this.foot_point_names[0]]).y > 400) {
			return;
		}
		if (++this.step_timer >= 10) {
			this.step_timer = 0;
			this.step_index += 1;
			const current_foot_point_name = this.foot_point_names[this.step_index % this.foot_point_names.length];
			const current_foot_pos = this.structure.points[current_foot_point_name];
			const next_foot_pos = { x: current_foot_pos.x, y: current_foot_pos.y };
			next_foot_pos.x += 50;
			next_foot_pos.y -= 50;
			for (let i = 0; i <= 50; i++) {
				next_foot_pos.y += 5;
				if (world.collision(this.toWorld(next_foot_pos))) {
					next_foot_pos.y -= 5;
					break;
				}
			}
			this.next_foot_positions[current_foot_point_name] = next_foot_pos;
		}
		for (const leg of this.legs) {
			const foot_point = this.structure.points[leg.foot_point_name];
			const next_foot_pos = this.next_foot_positions[leg.foot_point_name];
			for (const segment_name in leg.point_names_by_segment_name) {
				const point_name = leg.point_names_by_segment_name[segment_name];
				this.structure.points[point_name].vx! += (next_foot_pos.x - foot_point.x) / 200;
				if (!this.foot_point_names.includes(point_name)) {
					this.structure.points[point_name].vy! -= 0.6;
				}
			}
			const dist = granddaddyLonglegsHelpers.distance(next_foot_pos, foot_point);
			const force = 2;
			foot_point.vx! += (next_foot_pos.x - foot_point.x) / dist * force;
			foot_point.vy! += (next_foot_pos.y - foot_point.y) / dist * force;
		}
		this.structure.points["body"].vy! -= 0.2;
		const collision = (point: Point) => world.collision(this.toWorld(point));
		this.structure.stepLayout({ gravity: 0.5, collision });
		for (let i = 0; i <= 10; i++) {
			this.structure.stepLayout();
		}
		for (let i = 0; i <= 4; i++) {
			this.structure.stepLayout({ collision });
		}
	}

	draw(ctx: CanvasRenderingContext2D): void {
		for (const segment_name in this.structure.segments) {
			const segment = this.structure.segments[segment_name];
			ctx.beginPath();
			ctx.moveTo(segment.a.x, segment.a.y);
			ctx.lineTo(segment.b.x, segment.b.y);
			ctx.lineWidth = segment.width!;
			ctx.lineCap = "round";
			ctx.strokeStyle = "#2c1c0a"; //"brown"
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.translate(this.structure.points.body.x, this.structure.points.body.y);
		ctx.scale(1, 0.7);
		ctx.arc(0, 0, 10, 0, TAU_GRANDDADDYLONGLEGS);
		ctx.fillStyle = "#2c1c0a"; //"#C15723" //"brown"
		ctx.fill();
	}
}

addGranddaddyLonglegsEntityClass(GranddaddyLonglegs);
module.exports = GranddaddyLonglegs;
