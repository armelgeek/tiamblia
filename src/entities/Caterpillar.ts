const CaterpillarEntity = require("./abstract/Entity.coffee");
const { addEntityClass: addCaterpillarEntityClass } = require("skele2d");
const caterpillarHelpers = require("skele2d").helpers;
const TAU_CATERPILLAR = Math.PI * 2;

interface CaterpillarPoint {
	x: number;
	y: number;
	name?: string;
	vx?: number;
	vy?: number;
	fx?: number;
	fy?: number;
	radius?: number;
	towards_ground?: { x: number; y: number };
	towards_ground_smoothed?: { x: number; y: number };
	attachment?: {
		entity_id: string;
		point: { x: number; y: number };
		ground_angle: number;
	} | null;
	relative_angle?: number;
}

interface CaterpillarSegment {
	a: CaterpillarPoint;
	b: CaterpillarPoint;
	length: number;
	width?: number;
}

interface World {
	collision: (params: any, options?: any) => any;
	getEntityByID: (id: string) => any;
	projectPointOutside: (point: CaterpillarPoint, options: any) => {
		closest_point_in_world: CaterpillarPoint;
		closest_point_in_hit_space: CaterpillarPoint;
		closest_segment: CaterpillarSegment;
	} | null;
}

const average = (v: number[]): number => {
	return v.reduce((a, b) => a + b, 0) / v.length;
};

const smoothOut = (array: number[], variance: number): number[] => {
	const t_average = average(array) * variance;
	const ret = new Array(array.length);
	for (let i = 0; i < array.length; i++) {
		const prev = i > 0 ? ret[i - 1] : array[i];
		const next = i < array.length ? array[i] : array[i - 1];
		ret[i] = average([t_average, average([prev, array[i], next])]);
	}
	return ret;
};

class Caterpillar extends CaterpillarEntity {
	constructor() {
		super();
		// relying on key order, so points & segments must not be named with simple numbers,
		// since numeric keys are sorted before other keys
		this.structure.addPoint("head");
		let previous_part_name = "head";
		for (let i = 1; i < 10; i++) {
			const part_name = `part_${i}`;
			previous_part_name = this.structure.addSegment({
				from: previous_part_name,
				to: part_name,
				name: part_name,
				length: 5,
				width: 4
			});
		}

		const parts_list = Object.values(this.structure.points).filter((part: any) => part.name.match(/head|part/));
		for (let part_index = 0; part_index < parts_list.length; part_index++) {
			const part = parts_list[part_index] as CaterpillarPoint;
			part.attachment = null;
			part.radius = 5 - part_index * 0.1;
			part.towards_ground = { x: 0, y: 0 };
			part.towards_ground_smoothed = { x: 0, y: 0 };

			if (part_index > 0) {
				const foot_name = `foot_${part_index}`;
				const leg_length = part.radius! + 2; // WET
				this.structure.addSegment({
					from: part.name!,
					to: foot_name,
					name: foot_name,
					length: leg_length,
					width: 1
				});
			}
		}

		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name];
			point.vx = 0;
			point.vy = 0;
		}

		this.structure.points.head.radius = 7;

		this.bbox_padding = 15;
	}

	initLayout(): void {
		for (const segment_name in this.structure.segments) {
			const segment = this.structure.segments[segment_name];
			segment.b.x = segment.a.x + segment.length;
		}
		for (const segment_name in this.structure.segments) {
			const segment = this.structure.segments[segment_name];
			if (segment.b.name!.match(/foot/)) {
				segment.b.x = segment.a.x;
				segment.b.y = segment.a.y + segment.length;
			}
		}
	}

	step(world: World): void {
		const parts_list = Object.values(this.structure.points).filter((part: any) => part.name.match(/head|part/)) as CaterpillarPoint[];

		// stop at end of the world
		for (const part of parts_list) {
			if (part.y + this.y > 400) {
				return;
			}
		}

		// reset/init
		for (const part of parts_list) {
			part.fx = 0;
			part.fy = 0;
			part.towards_ground = part.towards_ground ?? { x: 0, y: 0 };
			part.towards_ground_smoothed = part.towards_ground_smoothed ?? { x: 0, y: 0 };
		}

		// smooth out towards_ground normals, making the caterpillar
		// hopefully pick a side of a tree branch to be on
		// variance = 1
		// smoothed_towards_ground_x_values = smoothOut((part.towards_ground.x for part in parts_list), variance)
		// smoothed_towards_ground_y_values = smoothOut((part.towards_ground.y for part in parts_list), variance)
		// for part, part_index in parts_list
		// 	part.towards_ground.x = smoothed_towards_ground_x_values[part_index]
		// 	part.towards_ground.y = smoothed_towards_ground_y_values[part_index]

		// move
		const collision = (point: CaterpillarPoint) => world.collision(this.toWorld(point), {
			types: (entity: any) =>
				!["Arrow", "Bow", "Water", "Caterpillar"].includes(entity.constructor.name)
		});
		const t = performance.now() / 1000;
		for (let part_index = 0; part_index < parts_list.length; part_index++) {
			const part = parts_list[part_index];
			let otherwise_attached = 0;
			for (const other_part of parts_list) {
				if (other_part !== part) {
					if (other_part.attachment) {
						otherwise_attached += 1;
					}
				}
			}
			// lift_foot = Math.sin(t + part_index/parts_list.length*Math.PI) < 0 and otherwise_attached >= 2
			// if part_index > 3 and part_index < parts_list.length - 3
			// 	lift_foot = true # don't let the middle of the caterpillar act as feet
			const dist_to_previous = part_index > 0 ? Math.hypot(part.x - parts_list[part_index - 1].x, part.y - parts_list[part_index - 1].y) : 0;
			let lift_foot = dist_to_previous > 10; // in case it's stretching out a lot, release some constraints
			if (part_index === 0) {
				lift_foot = true; // head doesn't have feet
			}
			if (lift_foot) {
				part.attachment = null;
			}
			const attachment_entity = part.attachment ? world.getEntityByID(part.attachment.entity_id) : null;
			if (attachment_entity) {
				let crawl_speed = 0 + 2 * (otherwise_attached > 4 ? 1 : 0); // also affected by fixity parameter
				// Reverse crawl direction if part.attachment.ground_angle points head-to-tail*
				// according to this local segment's orientation.
				// *or possibly the opposite. I'm not gonna fact check this.
				let heading: number;
				if (parts_list[part_index + 1]) {
					heading = Math.atan2(parts_list[part_index].y - parts_list[part_index + 1].y, parts_list[part_index].x - parts_list[part_index + 1].x);
				} else {
					heading = Math.atan2(parts_list[part_index - 1].y - parts_list[part_index].y, parts_list[part_index - 1].x - parts_list[part_index].x);
				}
				if (Math.cos(part.attachment!.ground_angle - heading) < 0) {
					crawl_speed *= -1;
				}

				// part.x = attachment_local.x
				// part.y = attachment_local.y
				// Move attachment point along the ground, using ground angle.
				// Test multiple angles in order to wrap around corners.
				const angle_offsets = [0];
				const n_angle_offsets_per_dir = 5;
				const max_angle_offset = TAU_CATERPILLAR / 3;
				for (let i = 1; i <= n_angle_offsets_per_dir; i++) {
					angle_offsets.push(max_angle_offset * i / n_angle_offsets_per_dir);
					angle_offsets.push(-max_angle_offset * i / n_angle_offsets_per_dir);
				}
				let hit: any = null;
				for (const angle_offset of angle_offsets) {
					const part_in_world = this.toWorld(part);
					const forward_vector = {
						x: Math.cos(part.attachment!.ground_angle + angle_offset) * crawl_speed,
						y: Math.sin(part.attachment!.ground_angle + angle_offset) * crawl_speed
					};
					// search towards the ground, in the direction it was last found
					const leg_length = part.radius! + 2; // WET
					const leg_vector = {
						x: part.towards_ground!.x * leg_length,
						y: part.towards_ground!.y * leg_length
					};
					const test_point_world = {
						x: part_in_world.x + forward_vector.x + leg_vector.x,
						y: part_in_world.y + forward_vector.y + leg_vector.y
					};

					hit = world.collision(test_point_world, {
						types: (entity: any) =>
							!["Arrow", "Bow", "Water", "Caterpillar"].includes(entity.constructor.name)
					});
					if (hit) {
						// Project the part's position back to the surface of the ground.
						const test_point_in_hit_space = hit.fromWorld(test_point_world);
						const projected = world.projectPointOutside(test_point_world, { outsideEntity: hit });
						if (projected) {
							const { closest_point_in_hit_space, closest_segment } = projected;

							// part.x = closest_point_local.x
							// part.y = closest_point_local.y
							if (!lift_foot) {
								let ground_angle = Math.atan2(closest_segment.b.y - closest_segment.a.y, closest_segment.b.x - closest_segment.a.x);
								if (isNaN(ground_angle)) {
									console.warn("ground_angle is NaN");
									ground_angle = 0;
								}
								const candidates = [];
								for (const side of [0, 1]) {
									let towards_ground_angle = ground_angle + TAU_CATERPILLAR / 4;
									if (side) {
										towards_ground_angle += TAU_CATERPILLAR / 2;
									}
									const towards_ground = {
										x: Math.cos(towards_ground_angle),
										y: Math.sin(towards_ground_angle)
									};
									const attachment_hit_space = {
										x: closest_point_in_hit_space.x - towards_ground.x * leg_length,
										y: closest_point_in_hit_space.y - towards_ground.y * leg_length
									};
									candidates.push({
										score: Math.hypot(attachment_hit_space.x - test_point_in_hit_space.x, attachment_hit_space.y - test_point_in_hit_space.y),
										towards_ground,
										attachment_hit_space
									});
								}
								candidates.sort((a, b) => b.score - a.score);
								const { attachment_hit_space, towards_ground } = candidates[0];
								part.attachment = { entity_id: hit.id, point: attachment_hit_space, ground_angle };
								part.towards_ground = towards_ground;
							}
							break;
						}
					}
				}

				if (!hit && otherwise_attached >= 2) {
					part.attachment = null;
				}
			} else {
				// part.x += part.vx
				// part.y += part.vy
				const hit = collision(part);
				if (hit) {
					part.vx = 0;
					part.vy = 0;

					// Project the part's position back to the surface of the ground.
					const part_world = this.toWorld(part);
					const projected = world.projectPointOutside(part_world, { outsideEntity: hit });
					if (projected) {
						const { closest_point_in_world, closest_point_in_hit_space, closest_segment } = projected;
						const closest_point_local = this.fromWorld(closest_point_in_world);
						let towards_ground = { x: part_world.x - closest_point_in_world.x, y: part_world.y - closest_point_in_world.y };
						const towards_ground_length = Math.hypot(towards_ground.x, towards_ground.y);
						towards_ground.x /= towards_ground_length;
						towards_ground.y /= towards_ground_length;
						if (!(isFinite(towards_ground.x) && isFinite(towards_ground.y))) {
							console.warn("NaN in towards_ground");
							towards_ground = { x: 0, y: 0 };
						}

						part.x = closest_point_local.x;
						part.y = closest_point_local.y;
						if (!lift_foot) {
							let ground_angle = Math.atan2(closest_segment.b.y - closest_segment.a.y, closest_segment.b.x - closest_segment.a.x);
							if (isNaN(ground_angle)) {
								console.warn("ground_angle is NaN");
								ground_angle = 0;
							}
							part.attachment = { entity_id: hit.id, point: closest_point_in_hit_space, ground_angle };
							part.towards_ground = towards_ground;
						}
					}
				} else {
					part.vy! += 0.5;
					part.vx! *= 0.99;
					part.vy! *= 0.99;
					// @structure.stepLayout({gravity: 0.005, collision})
					// @structure.stepLayout() for [0..10]
					// @structure.stepLayout({collision}) for [0..4]
					part.x += part.vx!;
					part.y += part.vy!;
				}
			}

			// angular constraint pivoting on this part
			const relative_angle = (Math.sin(Math.sin(t) * Math.PI / 4) - 0.5) * Math.PI / parts_list.length / 2;
			part.relative_angle = relative_angle;
			const prev_part = parts_list[part_index - 1];
			const next_part = parts_list[part_index + 1];
			if (prev_part && next_part) {
				this.accumulate_angular_constraint_forces(prev_part, next_part, part, relative_angle);
			}
		}

		// apply forces
		for (const part of parts_list) {
			part.vx! += part.fx!;
			part.vy! += part.fy!;
			part.x += part.fx!;
			part.y += part.fy!;
		}

		// Interact with water
		for (const part of parts_list) {
			const water = world.collision(this.toWorld(part), {
				types: (entity: any) =>
					entity.constructor.name === "Water"
			});
			const too_far_under_water = water && world.collision(this.toWorld({ x: part.x, y: part.y - part.radius! }), {
				types: (entity: any) =>
					entity.constructor.name === "Water"
			});
			if (water && !too_far_under_water) {
				// Make ripples in water
				water.makeWaves(this.toWorld(part), part.radius, part.vy! / 2);
				// Skip off water (as if this will ever matter)
				if (4 > part.vy! && part.vy! > 2 && Math.abs(part.vx!) > 0.4) {
					part.vy! *= -0.3;
				}
			}
			// Slow down in water, and buoy
			if (water) {
				part.vx! -= part.vx! * 0.1;
				part.vy! -= part.vy! * 0.1;
				part.vy! -= 0.45;
			}
		}

		// smooth normals over time
		for (const part of parts_list) {
			part.towards_ground_smoothed = part.towards_ground_smoothed ?? { x: 0, y: 0 };
			part.towards_ground_smoothed.x += ((part.towards_ground?.x ?? 0) - part.towards_ground_smoothed.x) * 0.1;
			part.towards_ground_smoothed.y += ((part.towards_ground?.y ?? 0) - part.towards_ground_smoothed.y) * 0.1;
		}

		// constrain distances
		for (let i = 0; i < 4; i++) {
			for (let part_index = 0; part_index < parts_list.length; part_index++) {
				const part = parts_list[part_index];
				const attachment_entity = part.attachment ? world.getEntityByID(part.attachment.entity_id) : null;
				if (attachment_entity) {
					const attachment_world = attachment_entity.toWorld(part.attachment!.point);
					const attachment_local = this.fromWorld(attachment_world);
					const fixity = 0.1; // also affects crawling speed
					part.x += (attachment_local.x - part.x) * fixity;
					part.y += (attachment_local.y - part.y) * fixity;
				}
			}
			for (const segment_name in this.structure.segments) {
				const segment = this.structure.segments[segment_name];
				if (segment.b.name!.match(/foot/)) {
					const part = segment.a;
					const foot = segment.b;
					const leg_length = segment.length;
					let foot_offset = { x: part.towards_ground_smoothed!.x * leg_length, y: part.towards_ground_smoothed!.y * leg_length };
					// rotate foot offset in sinusoidal fashion
					const n = Number(part.name!.match(/\d+/));
					const leg_angle = Math.sin(performance.now() / 80 + n) * 0.1;
					const sin_leg_angle = Math.sin(leg_angle);
					const cos_leg_angle = Math.cos(leg_angle);
					[foot_offset.x, foot_offset.y] = [foot_offset.x * cos_leg_angle - foot_offset.y * sin_leg_angle, foot_offset.x * sin_leg_angle + foot_offset.y * cos_leg_angle];

					foot.x = part.x + foot_offset.x;
					foot.y = part.y + foot_offset.y;
					continue;
				}
				const delta_x = segment.a.x - segment.b.x;
				const delta_y = segment.a.y - segment.b.y;
				const delta_length = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
				const diff = (delta_length - segment.length) / delta_length;
				if (isFinite(diff)) {
					segment.a.x -= delta_x * 0.5 * diff;
					segment.a.y -= delta_y * 0.5 * diff;
					segment.b.x += delta_x * 0.5 * diff;
					segment.b.y += delta_y * 0.5 * diff;
					segment.a.vx! -= delta_x * 0.5 * diff;
					segment.a.vy! -= delta_y * 0.5 * diff;
					segment.b.vx! += delta_x * 0.5 * diff;
					segment.b.vy! += delta_y * 0.5 * diff;
				} else {
					console.warn("diff is not finite, for Caterpillar distance constraint");
				}
			}
			// self-collision
			for (let part_index = 0; part_index < parts_list.length; part_index++) {
				const part = parts_list[part_index];
				for (let other_part_index = 0; other_part_index < parts_list.length; other_part_index++) {
					const other_part = parts_list[other_part_index];
					if (Math.abs(part_index - other_part_index) < 3) {
						continue;
					}
					const delta_x = part.x - other_part.x;
					const delta_y = part.y - other_part.y;
					const delta_length = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
					const target_min_length = part.radius! + other_part.radius!;
					if (delta_length < target_min_length) {
						const diff = (delta_length - target_min_length) / delta_length;
						if (isFinite(diff)) {
							part.x -= delta_x * 0.5 * diff;
							part.y -= delta_y * 0.5 * diff;
							other_part.x += delta_x * 0.5 * diff;
							other_part.y += delta_y * 0.5 * diff;
							part.vx! -= delta_x * 0.5 * diff;
							part.vy! -= delta_y * 0.5 * diff;
							other_part.vx! += delta_x * 0.5 * diff;
							other_part.vy! += delta_y * 0.5 * diff;
						} else {
							console.warn("diff is not finite, for Caterpillar self-collision constraint");
						}
					}
				}
			}
		}
	}

	accumulate_angular_constraint_forces(a: CaterpillarPoint, b: CaterpillarPoint, pivot: CaterpillarPoint, relative_angle: number): void {
		const angle_a = Math.atan2(a.y - b.y, a.x - b.x);
		const angle_b = Math.atan2(pivot.y - b.y, pivot.x - b.x);
		const angle_diff = (angle_a - angle_b) - relative_angle;

		// angle_diff *= 0.9
		const distance = Math.hypot(a.x - b.x, a.y - b.y);
		// distance_a = Math.hypot(a.x - pivot.x, a.y - pivot.y)
		// distance_b = Math.hypot(b.x - pivot.x, b.y - pivot.y)
		// angle_diff /= Math.max(1, (distance / 5) ** 2.4)

		const old_a = { x: a.x, y: a.y };
		const old_b = { x: b.x, y: b.y };

		// Rotate around pivot.
		const rot_matrix = [[Math.cos(angle_diff), Math.sin(angle_diff)], [-Math.sin(angle_diff), Math.cos(angle_diff)]];
		const rot_matrix_inverse = [[Math.cos(-angle_diff), Math.sin(-angle_diff)], [-Math.sin(-angle_diff), Math.cos(-angle_diff)]];
		for (const point of [a, b]) {
			// Translate and rotate.
			const matrix = point === a ? rot_matrix : rot_matrix_inverse;
			[point.x, point.y] = [
				matrix[0][0] * (point.x - pivot.x) + matrix[0][1] * (point.y - pivot.y),
				matrix[1][0] * (point.x - pivot.x) + matrix[1][1] * (point.y - pivot.y)
			];
			// Translate back.
			point.x += pivot.x;
			point.y += pivot.y;
		}

		const f = 0.5;
		// using individual distances can cause spinning (overall angular momentum from nothing)
		// f_a = f / Math.max(1, Math.max(0, distance_a - 3) ** 1)
		// f_b = f / Math.max(1, Math.max(0, distance_b - 3) ** 1)
		// using the combined distance conserves overall angular momentum,
		// to say nothing of the physicality of the rest of this system
		// but it's a clear difference in zero gravity
		const f_a = f / Math.max(1, Math.max(0, distance - 6) ** 1);
		const f_b = f / Math.max(1, Math.max(0, distance - 6) ** 1);

		// Turn difference in position into velocity.
		if (!a.attachment) {
			a.fx! += (a.x - old_a.x) * f_a;
			a.fy! += (a.y - old_a.y) * f_a;
		}
		if (!b.attachment) {
			b.fx! += (b.x - old_b.x) * f_b;
			b.fy! += (b.y - old_b.y) * f_b;
		}

		// Opposite force on pivot.
		if (!pivot.attachment) {
			pivot.fx! -= (a.x - old_a.x) * f_a;
			pivot.fy! -= (a.y - old_a.y) * f_a;
			pivot.fx! -= (b.x - old_b.x) * f_b;
			pivot.fy! -= (b.y - old_b.y) * f_b;
		}

		// Restore old position.
		a.x = old_a.x;
		a.y = old_a.y;
		b.x = old_b.x;
		b.y = old_b.y;
	}

	draw(ctx: CanvasRenderingContext2D, _view: any, world: World): void {
		const color = "green";
		for (const segment_name in this.structure.segments) {
			const segment = this.structure.segments[segment_name];
			ctx.beginPath();
			ctx.moveTo(segment.a.x, segment.a.y);
			ctx.lineTo(segment.b.x, segment.b.y);
			ctx.lineWidth = segment.width!;
			ctx.lineCap = "round";
			ctx.strokeStyle = color;
			ctx.stroke();
		}
		const parts_list = Object.values(this.structure.points).filter((part: any) => part.name.match(/head|part/)) as CaterpillarPoint[];
		// for part, part_index in parts_list
		// reverse order to draw head on top
		for (let part_index = parts_list.length - 1; part_index >= 0; part_index--) {
			const part = parts_list[part_index];
			// body part
			ctx.save();
			ctx.beginPath();
			ctx.arc(part.x, part.y, part.radius!, 0, TAU_CATERPILLAR);
			// ctx.fillStyle = if part.attachment then "lime" else color
			// ctx.fillStyle = "hsla(#{(part.relative_angle ? 0) * 10 * 180 / Math.PI}, 100%, 50%, 0.5)"
			// ctx.fillStyle = "hsla(#{(part.relative_angle ? 0) * 10 * 180 / Math.PI}, 100%, 50%, #{if part.attachment then 1 else 0.3})"
			ctx.fillStyle = color;
			ctx.fill();
			ctx.clip();
			// highlight
			ctx.beginPath();
			ctx.arc(part.x + part.radius! / 3, part.y - part.radius! / 3, part.radius! / 2, 0, TAU_CATERPILLAR);
			// ctx.fillStyle = "rgba(255, 255, 155, 0.5)"
			ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
			ctx.fill();
			ctx.restore();
			// eye
			if (part.name === "head") {
				ctx.beginPath();
				ctx.arc(part.x, part.y, part.radius! / 2, 0, TAU_CATERPILLAR);
				ctx.fillStyle = "black";
				ctx.fill();
				// highlight
				ctx.beginPath();
				ctx.arc(part.x + part.radius! / 6, part.y - part.radius! / 6, part.radius! / 5, 0, TAU_CATERPILLAR);
				ctx.fillStyle = "white";
				ctx.fill();
			}
		}

		for (const point_name in this.structure.points) {
			const part = this.structure.points[point_name];
			if ((localStorage as any)["tiamblia.debug_caterpillar"] === "true") {
				// draw line from part to attachment
				if (part.attachment) {
					const entity = world.getEntityByID(part.attachment.entity_id);
					const attachment_local = this.fromWorld(entity.toWorld(part.attachment.point));
					ctx.beginPath();
					ctx.moveTo(part.x, part.y);
					ctx.lineTo(attachment_local.x, attachment_local.y);
					ctx.lineWidth = 1;
					ctx.lineCap = "round";
					ctx.strokeStyle = "red";
					ctx.stroke();
				}
				// draw normal
				if (part.towards_ground) {
					ctx.beginPath();
					ctx.moveTo(part.x, part.y);
					ctx.lineTo(part.x + part.towards_ground.x * 10, part.y + part.towards_ground.y * 10);
					ctx.lineWidth = 1;
					ctx.lineCap = "round";
					ctx.strokeStyle = "lime";
					ctx.stroke();
				}
			}
		}
	}
}

addCaterpillarEntityClass(Caterpillar);
module.exports = Caterpillar;
