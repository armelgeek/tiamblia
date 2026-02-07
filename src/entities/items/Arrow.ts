const ArrowEntity = require("../abstract/Entity.ts");
const { addEntityClass: addArrowEntityClass } = require("skele2d");
const skele2dHelpers = require("skele2d").helpers;
const TAU_ARROW = Math.PI * 2;

const debug_drawings = new Map<Arrow, any[]>();

(window as any).debug_drawings = debug_drawings;

class Arrow extends ArrowEntity {
	static steps_per_frame = 2;

	length: number;
	structure: any;
	bbox_padding: number;
	lodging_constraints: any[];

	constructor() {
		super();

		this.length = 20;

		this.structure.addPoint("tip");
		this.structure.addSegment({
			from: "tip",
			to: "nock",
			name: "shaft",
			length: this.length
		});
		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name as keyof typeof this.structure.points];
			point.prev_x = point.x;
			point.prev_y = point.y;
			point.ax = 0;
			point.ay = 0;
		}

		this.bbox_padding = 20;

		// When the arrow hits something, a constraint will be added between
		// a point on the object, and a point on the arrow which may slide somewhat along the shaft.
		this.lodging_constraints = [];
	}

	initLayout(): void {
		this.structure.points.tip.x += this.length;
		this.structure.points.tip.prev_x = this.structure.points.tip.x;
	}

	setVelocity(vx: number, vy: number): void {
		this.structure.points.tip.prev_x = this.structure.points.tip.x - vx / Arrow.steps_per_frame;
		this.structure.points.tip.prev_y = this.structure.points.tip.y - vy / Arrow.steps_per_frame;
		this.structure.points.nock.prev_x = this.structure.points.nock.x - vx / Arrow.steps_per_frame;
		this.structure.points.nock.prev_y = this.structure.points.nock.y - vy / Arrow.steps_per_frame;
	}

	getAverageVelocity(): [number, number] {
		const { tip, nock } = this.structure.points;
		const vx = (tip.x - tip.prev_x + nock.x - nock.prev_x) / 2 * Arrow.steps_per_frame;
		const vy = (tip.y - tip.prev_y + nock.y - nock.prev_y) / 2 * Arrow.steps_per_frame;
		return [vx, vy];
	}

	step(world: any): void {
		for (let i = 0; i <= Arrow.steps_per_frame; i++) {
			this.substep(world, 1 / Arrow.steps_per_frame);
		}

		// Interact with water
		const { tip, nock } = this.structure.points;
		for (const point of [tip, nock]) {
			const water = world.collision(this.toWorld(point), {
				types: (entity: any) => entity.constructor.name === "Water"
			});
			const too_far_under_water = water && world.collision(this.toWorld({ x: point.x, y: point.y - 5 }), {
				types: (entity: any) => entity.constructor.name === "Water"
			});
			if (water && !too_far_under_water) {
				let vy = (point.y - point.prev_y) * Arrow.steps_per_frame;
				const vx = (point.x - point.prev_x) * Arrow.steps_per_frame;
				// Make ripples in water
				water.makeWaves!(this.toWorld(point), 2, vy);
				// Skip off water
				if (4 > vy && vy > 2 && Math.abs(vx) > 0.4) {
					vy *= -0.3;
					point.prev_y = point.y - vy / Arrow.steps_per_frame;
				}
			}
			// Slow down in water
			if (water) {
				point.prev_x += (point.x - point.prev_x) * 0.1;
				point.prev_y += (point.y - point.prev_y) * 0.1;
			}
		}
	}

	substep(world: any, delta_time: number): void {
		const { tip, nock } = this.structure.points;

		// Accumulate forces as acceleration.
		// (First, reset acceleration to zero.)
		for (const point of [tip, nock]) {
			point.ax = 0;
			point.ay = 0;
		}

		// Gravity
		tip.ay += 0.1;
		nock.ay += 0.1;

		// If dropped completely sideways, it should end up lying on the ground
		// but the fletching should introduce some drag in that direction,
		// leading to a slight rotation.
		// However the fletching shouldn't introduce much drag in the direction of travel.

		// Introduce drag on fletched side, perpendicular to the arrow shaft.
		// First, find the angle of the arrow shaft, and the current velocity.
		const angle = Math.atan2(tip.y - nock.y, tip.x - nock.x);
		let [nock_vx, nock_vy] = [nock.x - nock.prev_x, nock.y - nock.prev_y];
		// Then, calculate the rotation matrix to rotate the velocity to the horizontal coordinate system.
		const rot_matrix1: [[number, number], [number, number]] = [[Math.cos(angle), Math.sin(angle)], [-Math.sin(angle), Math.cos(angle)]];
		// Apply the rotation to the velocity.
		[nock_vx, nock_vy] = [nock_vx, nock_vy].map((_val, idx) => rot_matrix1[idx][0] * nock_vx + rot_matrix1[idx][1] * nock_vy) as [number, number];
		// Then, calculate drag force based on the nock's velocity.
		// drag_force_x = -nock_vx * Math.abs(nock_vx) * 0.04 # tangent to arrow shaft
		// drag_force_y = -nock_vy * Math.abs(nock_vy) * 0.3 # perpendicular to arrow shaft
		let drag_force_x = 0; // tangent to arrow shaft
		let drag_force_y = -nock_vy * Arrow.steps_per_frame * 0.002; // perpendicular to arrow shaft
		// Then, calculate the rotation matrix to rotate the force back to the original coordinate system.
		const rot_matrix2: [[number, number], [number, number]] = [[Math.cos(-angle), Math.sin(-angle)], [-Math.sin(-angle), Math.cos(-angle)]];
		// Apply the rotation to the force.
		[drag_force_x, drag_force_y] = [drag_force_x, drag_force_y].map((_val, idx) => rot_matrix2[idx][0] * drag_force_x + rot_matrix2[idx][1] * drag_force_y) as [number, number];
		// Apply the force.
		if (isFinite(drag_force_x) && isFinite(drag_force_y)) {
			nock.ax += drag_force_x;
			nock.ay += drag_force_y;
		} else {
			console.warn("NaN in drag force calculation");
		}

		// Perform Verlet integration.
		for (const point of [tip, nock]) {
			const original_pos = { x: point.x, y: point.y };
			// Ideally I would like to allow the arrow to move while lodged,
			// and adjust the depth and angle of lodging (with some stiffness),
			// and maybe allow it to become dislodged, but it was causing numerical instability.
			if (!this.lodging_constraints.length) {
				point.x += point.x - point.prev_x + point.ax * delta_time ** 2;
				point.y += point.y - point.prev_y + point.ay * delta_time ** 2;
			}
			point.prev_x = original_pos.x;
			point.prev_y = original_pos.y;
		}

		// Apply constraints.

		// check if player is holding the arrow
		const held = world.entities.some((entity: any) => entity.holding_arrows?.includes(this));

		// Note: can't require Player here (to use instanceof check) because of circular dependency
		const hit = world.collision(this.toWorld(tip), {
			types: (entity: any) => !["Arrow", "Player", "Bow", "Water"].includes(entity.constructor.name)
		});
		if (hit && !this.lodging_constraints.length && !held) {
			// collision() doesn't give us the line segment that we hit.
			// We want to know the segment point in order to add a lodging constraint at the intersection point.
			const tip_relative = hit.fromWorld(this.toWorld(tip));
			const nock_relative = hit.fromWorld(this.toWorld(nock));
			let hit_segment: Segment | undefined = undefined;
			let surface_angle: number | undefined = undefined;
			let relative_angle: number | undefined = undefined;
			let incident_speed: number | undefined = undefined; // speed along the surface normal (i.e. towards the surface), ignoring motion along the surface
			let heading_angle_of_incidence: number | undefined = undefined;
			let facing_angle_of_incidence: number | undefined = undefined;
			let hit_segment_position_ratio = 0;
			let arrow_segment_position_ratio = 0; // AKA depth ratio
			for (const segment_name in hit.structure.segments) {
				const segment = hit.structure.segments[segment_name];
				if (skele2dHelpers.lineSegmentsIntersect(tip_relative.x, tip_relative.y, nock_relative.x, nock_relative.y, segment.a.x, segment.a.y, segment.b.x, segment.b.y)) {
					surface_angle = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x);
					const arrow_angle = Math.atan2(tip_relative.y - nock_relative.y, tip_relative.x - nock_relative.x);
					relative_angle = arrow_angle - surface_angle;
					const normal = surface_angle + TAU_ARROW / 4;
					const vx = tip.x - tip.prev_x;
					const vy = tip.y - tip.prev_y;
					const heading_angle = Math.atan2(vy, vx);
					incident_speed = Math.abs(Math.cos(normal) * vx + Math.sin(normal) * vy);
					// incident_speed = Math.abs(Math.sin(-surface_angle) * vx + Math.cos(-surface_angle) * vy) # alternative
					const modulo = (a: number, b: number) => ((a % b) + b) % b;
					heading_angle_of_incidence = Math.abs(Math.abs(modulo(heading_angle - surface_angle, Math.PI)) - TAU_ARROW / 4);
					facing_angle_of_incidence = Math.abs(Math.abs(modulo(arrow_angle - surface_angle, Math.PI)) - TAU_ARROW / 4);
					// window.debug_max_facing_angle_of_incidence = Math.max(window.debug_max_facing_angle_of_incidence ? 0, facing_angle_of_incidence) # should be TAU/4 on arrow test scene
					// window.debug_max_heading_angle_of_incidence = Math.max(window.debug_max_heading_angle_of_incidence ? 0, heading_angle_of_incidence) # should be TAU/4 on arrow test scene

					// This could be more nuanced, but I'm trying to make it easier to hit animals.
					// It's not satisfying when an arrow flies past your mark, and this is a 2D game so it's confusing
					// when it looks like you missed in the z-axis.
					const ignore_angle_of_incidence = ["Rabbit", "Deer", "GranddaddyLonglegs"].includes(hit.constructor.name);
					if (ignore_angle_of_incidence) {
						incident_speed = Math.hypot(vx, vy);
						heading_angle_of_incidence = 0;
						facing_angle_of_incidence = 0;
					}

					// Arrows coming in at a grazing angle should bounce off.
					// Arrows coming straight towards the surface but not facing forward should bounce off.
					// Arrows going slow should bounce off.
					// A combination of speed, angle of incidence, and arrow angle is needed.

					// Arrows going fast enough towards the surface (i.e. in the axis perpendicular to the surface) should lodge.
					// The time subdivision shouldn't affect the speed threshold.
					const incident_speed_global_scale = incident_speed * Arrow.steps_per_frame;
					if (incident_speed_global_scale < 2) {
						// console.log "not lodging, incident_speed_global_scale too low", incident_speed_global_scale
						continue;
					}
					if (facing_angle_of_incidence > Math.PI / 4) { // 45 degrees
						// console.log "not lodging, arrow is not facing head-on enough"
						continue;
					}
					if (hit.constructor.name === "Rock") {
						// console.log "not lodging, hit rock"
						continue;
					}

					hit_segment = segment;
					// find position ratios of the intersection point on each segment
					const p1 = segment.a;
					const p2 = segment.b;
					const p3 = tip_relative;
					const p4 = nock_relative;
					// at segment.a = 0, at segment.b = 1
					hit_segment_position_ratio =
						((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / ((p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x));
					// at tip = 0, at nock = 1
					arrow_segment_position_ratio =
						-((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / ((p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x));
					// console.log "found intersection", hit_segment_position_ratio, arrow_segment_position_ratio
					break;
				}
			}
			// I'm only allowing one lodging constraint per arrow for now.
			// Ideally I would like to allow the arrow to pin an enemy to the ground,
			// using multiple constraints, but this will probably require the whole game to be
			// simulated together with something like Verlet integration, so that the
			// enemy's limb can be constrained in a stable way.
			// But maybe with specific targets it can be enabled to work.
			// Also, TODO: bounce off if the angle is not perpendicular enough
			// (i.e. angle of incidence is too high)
			if (hit_segment && this.lodging_constraints.length === 0) {
				const constraint: any = {
					hit_entity_id: hit.id,
					hit_segment_name: Object.keys(hit.structure.segments)[Object.values(hit.structure.segments).indexOf(hit_segment)],
					relative_angle: relative_angle!,
					hit_segment_position_ratio,
					arrow_segment_position_ratio,
					incident_speed: incident_speed!,
					heading_angle_of_incidence: heading_angle_of_incidence!,
					facing_angle_of_incidence: facing_angle_of_incidence!
				};
				this.lodging_constraints.push(constraint);
				// Damage the target.
				if ("alive" in hit) {
					hit.alive = false;
				}
			}
		}

		// Ideally I would like to allow the arrow to move while lodged,
		// and adjust the depth and angle of lodging (with some stiffness),
		// and maybe allow it to become dislodged, but it was causing numerical instability.
		if (!this.lodging_constraints.length && !held) {
			// Collide with the ground.
			for (const point of [tip, nock]) {
				const hit = world.collision(this.toWorld(point));
				if (hit) {
					const coefficient_of_restitution = hit.constructor.name === "Rock" ? 0.5 : 0.1;
					const coefficient_of_friction = 0.1;

					const vx = point.x - point.prev_x;
					const vy = point.y - point.prev_y;
					const speed = Math.hypot(vx, vy);

					// if not debug_drawings.has(@)
					// 	debug_drawings.set(@, [])
					// debug_drawings.get(@).push({
					// 	type: "line"
					// 	a: {x: point.x, y: point.y}
					// 	b: {x: point.x + vx, y: point.y + vy}
					// 	color: "yellow"
					// })
					// # debug_drawings.get(@).push({
					// # 	type: "circle"
					// # 	center: {x: point.x, y: point.y}
					// # 	radius: 5
					// # 	color: "yellow"
					// # })

					// Project the point back to the surface of the polygon.
					const projected = world.projectPointOutside(this.toWorld(point), { outsideEntity: hit });
					let closest_segment: Segment | undefined;
					if (projected) {
						const { closest_point_in_world, closest_segment: seg } = projected;
						closest_segment = seg;
						const closest_point_local = this.fromWorld(closest_point_in_world);
						point.x = closest_point_local.x;
						point.y = closest_point_local.y;
						// debug_drawings.get(@).push({
						// 	type: "circle"
						// 	center: {x: point.x, y: point.y}
						// 	radius: 5
						// 	color: "lime"
						// })
					}

					// bounce off the surface, reflecting the angle
					if (speed > 0 && closest_segment) {
						let vx = point.x - point.prev_x;
						let vy = point.y - point.prev_y;
						// console.log("hit.constructor.name", hit.constructor.name, "coefficient_of_restitution", coefficient_of_restitution)
						// heading_angle = Math.atan2(vy, vx)
						const surface_angle = Math.atan2(closest_segment.b.y - closest_segment.a.y, closest_segment.b.x - closest_segment.a.x);
						// a = surface_angle * 2 - heading_angle
						// a = if a >= TAU then a - TAU else if a < 0 then a + TAU else a
						// new_vx = Math.cos(a) * speed * coefficient_of_restitution
						// new_vy = Math.sin(a) * speed * coefficient_of_restitution

						// Rotate the velocity vector to the surface normal.
						const rot_matrix1 = [
							[Math.cos(surface_angle), -Math.sin(surface_angle)],
							[Math.sin(surface_angle), Math.cos(surface_angle)]
						];
						let [rotated_vx, rotated_vy] = [vx, vy].map((_v, idx) => rot_matrix1[idx][0] * vx + rot_matrix1[idx][1] * vy) as [number, number];
						// Reflect the velocity vector.
						rotated_vx *= -coefficient_of_restitution;
						rotated_vy *= (1 - coefficient_of_friction);
						// Rotate the velocity vector back to the original direction.
						const rot_matrix2 = [
							[Math.cos(-surface_angle), -Math.sin(-surface_angle)],
							[Math.sin(-surface_angle), Math.cos(-surface_angle)]
						];
						const [new_vx, new_vy] = [rotated_vx, rotated_vy].map((_v, idx) => rot_matrix2[idx][0] * rotated_vx + rot_matrix2[idx][1] * rotated_vy) as [number, number];

						// console.log("old vx, vy", vx, vy, "new vx, vy", new_vx, new_vy)
						point.prev_x = point.x - new_vx;
						point.prev_y = point.y - new_vy;
						// At this point, the other particle's velocity has not been updated,
						// and it will often cancel out the bounce even for a perfectly elastic collision.
						// That's not good enough.
						// Transfer energy along the arrow shaft,
						// by constraining the distance between the two points.
						// What this does is cancel the velocity of the other point,
						// implicit in it having moved forwards in time,
						// but only in the direction that it needs to.
						// In contrast to the normal distance constraint, I'm not
						// going to symmetrically move both points, but rather keep the
						// collided point stationary so it doesn't get pushed back into the surface,
						// and move the other point fully rather than halfway.
						const other_point = point === tip ? nock : tip;
						const delta_x = point.x - other_point.x;
						const delta_y = point.y - other_point.y;
						const delta_length = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
						const diff = (delta_length - this.length) / delta_length;
						if (isFinite(diff)) {
							other_point.x += delta_x * diff;
							other_point.y += delta_y * diff;
						} else {
							console.warn("diff is not finite, for momentary distance constraint");
						}
					}
				}
			}
		}

		// Constrain when lodged in an object.
		for (const { hit_entity_id, hit_segment_name, relative_angle, arrow_segment_position_ratio, hit_segment_position_ratio } of this.lodging_constraints) {
			const hit_entity = world.getEntityByID(hit_entity_id);
			if (!hit_entity) { // no longer exists
				this.lodging_constraints = [];
				break;
			}
			const hit_segment = hit_entity.structure.segments[hit_segment_name];

			const hit_segment_pos = hit_entity.toWorld({
				x: hit_segment.a.x + (hit_segment.b.x - hit_segment.a.x) * hit_segment_position_ratio,
				y: hit_segment.a.y + (hit_segment.b.y - hit_segment.a.y) * hit_segment_position_ratio
			});
			const arrow_shaft_pos = this.toWorld({
				x: tip.x + (nock.x - tip.x) * arrow_segment_position_ratio,
				y: tip.y + (nock.y - tip.y) * arrow_segment_position_ratio
			});
			const pos_diff = {
				x: hit_segment_pos.x - arrow_shaft_pos.x,
				y: hit_segment_pos.y - arrow_shaft_pos.y
			};
			if (isNaN(pos_diff.x) || isNaN(pos_diff.y)) {
				console.warn("pos_diff has NaN");
				continue;
			}
			// TODO: for non-static objects,
			// move the object equally in the opposite direction (each only halfway)
			// And integrate all physics in the same loop, for Verlet integration.
			tip.x += pos_diff.x;
			tip.y += pos_diff.y;
			nock.x += pos_diff.x;
			nock.y += pos_diff.y;

			const arrow_angle = Math.atan2(tip.y - nock.y, tip.x - nock.x);
			const hit_segment_angle = Math.atan2(hit_segment.b.y - hit_segment.a.y, hit_segment.b.x - hit_segment.a.x);
			const angle_diff = (arrow_angle - hit_segment_angle) - relative_angle;

			// Rotate the arrow.
			const arrow_shaft_pos_local = this.fromWorld(arrow_shaft_pos); // redundant calculation
			// Rotate the arrow around the arrow shaft attachment point.
			const rot_matrix: [[number, number], [number, number]] = [[Math.cos(angle_diff), Math.sin(angle_diff)], [-Math.sin(angle_diff), Math.cos(angle_diff)]];
			for (const point of [tip, nock]) {
				// Translate and rotate the arrow.
				[point.x, point.y] = [point.x, point.y].map((_val, idx) =>
					rot_matrix[idx][0] * (point.x - arrow_shaft_pos_local.x) +
					rot_matrix[idx][1] * (point.y - arrow_shaft_pos_local.y)
				) as [number, number];
				// Translate the arrow back to its original position.
				point.x += arrow_shaft_pos_local.x;
				point.y += arrow_shaft_pos_local.y;
			}
		}

		// Constrain arrow length, moving both points symmetrically.
		// I learned this from:
		// http://web.archive.org/web/20080410171619/http://www.teknikus.dk/tj/gdc2001.htm
		const delta_x = tip.x - nock.x;
		const delta_y = tip.y - nock.y;
		const delta_length = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
		const diff = (delta_length - this.length) / delta_length;
		if (isFinite(diff)) {
			tip.x -= delta_x * 0.5 * diff;
			tip.y -= delta_y * 0.5 * diff;
			nock.x += delta_x * 0.5 * diff;
			nock.y += delta_y * 0.5 * diff;
		} else {
			console.warn("diff is not finite, for distance constraint");
		}
	}

	draw(ctx: CanvasRenderingContext2D): void {
		const { tip, nock } = this.structure.points;
		ctx.beginPath();
		ctx.moveTo(tip.x, tip.y);
		ctx.lineTo(nock.x, nock.y);
		ctx.lineWidth = 1;
		ctx.lineCap = "round";
		ctx.strokeStyle = "#74552B";
		ctx.stroke();
		const angle = Math.atan2(tip.y - nock.y, tip.x - nock.x) + TAU_ARROW / 4;

		ctx.save();
		ctx.translate(tip.x, tip.y);
		ctx.rotate(angle);
		ctx.beginPath();
		ctx.moveTo(0, -2);
		ctx.lineTo(-2, 2);
		ctx.lineTo(0, 1);
		ctx.lineTo(+2, 2);
		ctx.fillStyle = "#2D1813";
		ctx.fill();
		ctx.restore();

		ctx.save();
		ctx.translate(nock.x, nock.y);
		ctx.rotate(angle);
		ctx.beginPath();
		ctx.translate(0, -4);
		ctx.moveTo(0, 0);
		ctx.lineTo(-2, 2);
		ctx.lineTo(-2, 4);
		ctx.lineTo(0, 3);
		ctx.lineTo(+2, 4);
		ctx.lineTo(+2, 2);
		ctx.fillStyle = "#B1280A";
		ctx.fill();
		ctx.restore();

		let debug_enabled = false;
		try {
			debug_enabled = localStorage["tiamblia.debug_arrow"] === "true";
		} catch (e) {
			// ignore
		}
		if (!debug_enabled) {
			return;
		}

		if (debug_drawings.get(this)) {
			for (const drawing of debug_drawings.get(this)!) {
				if (drawing.type === "line") {
					ctx.beginPath();
					ctx.moveTo(drawing.a!.x, drawing.a!.y);
					ctx.lineTo(drawing.b!.x, drawing.b!.y);
					ctx.lineWidth = 1;
					ctx.lineCap = "round";
					ctx.strokeStyle = drawing.color ?? "#FF0000";
					ctx.stroke();
				} else if (drawing.type === "circle") {
					ctx.beginPath();
					ctx.arc(drawing.center!.x, drawing.center!.y, drawing.radius!, 0, TAU_ARROW);
					ctx.lineWidth = 1;
					ctx.strokeStyle = drawing.color ?? "#FF0000";
					ctx.stroke();
				} else {
					console.error(`Unknown debug drawing type: ${(drawing as any).type}`);
				}
			}
		}

		for (const { hit_entity_id, hit_segment_name, arrow_segment_position_ratio, hit_segment_position_ratio, facing_angle_of_incidence } of this.lodging_constraints) {
			const hit_entity = (window as any).the_world.getEntityByID(hit_entity_id);
			if (!hit_entity) { // no longer exists
				continue;
			}
			const hit_segment = hit_entity.structure.segments[hit_segment_name];

			if (!hit_entity.toWorld) {
				console.error("Need to fix serialization of references to entities (and segments) with something like resurrect.js!");
				this.lodging_constraints.length = 0;
				break;
			}
			const hit_segment_a_local = this.fromWorld(hit_entity.toWorld(hit_segment.a));
			const hit_segment_b_local = this.fromWorld(hit_entity.toWorld(hit_segment.b));
			ctx.beginPath();
			ctx.moveTo(hit_segment_a_local.x, hit_segment_a_local.y);
			ctx.lineTo(hit_segment_b_local.x, hit_segment_b_local.y);
			ctx.lineWidth = 1;
			ctx.lineCap = "round";
			ctx.strokeStyle = "#FF0000";
			ctx.stroke();

			const hit_segment_pos = hit_entity.toWorld({
				x: hit_segment.a.x + (hit_segment.b.x - hit_segment.a.x) * hit_segment_position_ratio,
				y: hit_segment.a.y + (hit_segment.b.y - hit_segment.a.y) * hit_segment_position_ratio
			});
			const arrow_shaft_pos = this.toWorld({
				x: tip.x + (nock.x - tip.x) * arrow_segment_position_ratio,
				y: tip.y + (nock.y - tip.y) * arrow_segment_position_ratio
			});
			const hit_segment_pos_local = this.fromWorld(hit_segment_pos);
			const arrow_shaft_pos_local = this.fromWorld(arrow_shaft_pos); // redundant calc but whatever

			ctx.beginPath();
			ctx.moveTo(hit_segment_pos_local.x, hit_segment_pos_local.y);
			ctx.lineTo(arrow_shaft_pos_local.x, arrow_shaft_pos_local.y);
			ctx.lineWidth = 1;
			ctx.lineCap = "round";
			ctx.strokeStyle = "#00FF00";
			ctx.stroke();

			// misc debug for colorizing based on a variable like
			// incident_speed, facing_angle_of_incidence, heading_angle_of_incidence, relative_angle
			ctx.beginPath();
			ctx.moveTo(tip.x, tip.y);
			ctx.lineTo(nock.x, nock.y);
			ctx.lineWidth = 2;
			ctx.lineCap = "round";
			ctx.strokeStyle = `hsl(50, 100%, ${facing_angle_of_incidence * 20}%)`;
			ctx.stroke();
		}
	}
}

addArrowEntityClass(Arrow);

module.exports = Arrow;
