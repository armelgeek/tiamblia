const PlayerSimpleActor = require("./abstract/SimpleActor.ts");
const PlayerEntity = require("./abstract/Entity.coffee");
const { Pose: PlayerPose } = require("skele2d");
const PlayerBow = require("./items/Bow.ts");
const PlayerArrow = require("./items/Arrow.ts");
const PlayerDeer = require("./Deer.ts");
const player_keyboard = require("../keyboard.ts");
const { addEntityClass: addPlayerEntityClass } = require("skele2d");
const { distance: player_distance } = require("skele2d").helpers;
const TAU_PLAYER = Math.PI * 2;

interface Point {
	x: number;
	y: number;
}

interface PointWithVelocity extends Point {
	vx: number;
	vy: number;
	prev_x?: number;
	prev_y?: number;
}

interface Segment {
	a: Point;
	b: Point;
	length: number;
}

interface World {
	entities: any[];
	collision: (params: any, options?: any) => any;
	closest: (point: Point, entityClass: any, filter?: (entity: any) => boolean) => {
		closest_entity: any;
		closest_dist: number;
		closest_segment: Segment;
	};
	getEntityByID: (id: string) => any;
}

interface View {
	toWorld: (point: Point) => Point;
	is_preview?: boolean;
}

interface Mouse extends Point {
	LMB: { down: boolean };
	RMB: { down: boolean };
}

interface Structure {
	addPoint(name: string): void;
	addSegment(config: {
		from: string;
		to?: string;
		name: string;
		length: number;
	}): void;
	points: { [key: string]: Point };
	segments: { [key: string]: Segment };
	getPose(): any;
	setPose(pose: any): void;
}

// Actually treat it as a segment, not an infinite line
// unlike copies of this function in other files
function closestPointOnLineSegmentPlayer(point: Point, a: Point, b: Point): Point {
	// https://stackoverflow.com/a/3122532/2624876
	const a_to_p = { x: point.x - a.x, y: point.y - a.y };
	const a_to_b = { x: b.x - a.x, y: b.y - a.y };
	const atb2 = a_to_b.x ** 2 + a_to_b.y ** 2;
	const atp_dot_atb = a_to_p.x * a_to_b.x + a_to_p.y * a_to_b.y;
	let t = atp_dot_atb / atb2;
	t = Math.max(0, Math.min(1, t));
	return { x: a.x + a_to_b.x * t, y: a.y + a_to_b.y * t };
}

let gamepad_aiming = false;
const gamepad_detect_threshold = 0.5; // axis value (not a deadzone! just switching from mouse to gamepad)
const gamepad_deadzone = 0.1; // axis value
let gamepad_jump_prev = false;
let gamepad_mount_prev = false;
const mouse_detect_threshold = 30; // pixels radius (movement can occur over any number of frames)
const mouse_detect_from = { x: 0, y: 0 };
addEventListener("mousemove", (e: MouseEvent) => {
	if (Math.hypot(e.clientX - mouse_detect_from.x, e.clientY - mouse_detect_from.y) > mouse_detect_threshold) {
		gamepad_aiming = false;
		mouse_detect_from.x = e.clientX;
		mouse_detect_from.y = e.clientY;
	}
	return;
});

class Player extends PlayerSimpleActor {
	static poses: { [key: string]: any } = {};
	static animations: { [key: string]: any[] } = {};
	static animation_json_path: string;

	declare structure: Structure;
	bbox_padding: number;
	holding_bow: any | null;
	holding_arrows: any[];
	riding: any | null;
	bow_drawn_to: number;
	run_animation_position: number;
	subtle_idle_animation_position: number;
	other_idle_animation_position: number;
	idle_animation: string | null;
	idle_timer: number;
	smoothed_facing_x_for_eyes: number;
	upper_body_facing_x: number;
	lower_body_facing_x: number;
	looking_y: number;
	hairs: PointWithVelocity[][];
	hair_initialized: boolean;
	reaching_for_segment?: Segment;
	reaching_for_entity?: any;
	reaching_with_secondary_hand?: boolean;
	ground_angle?: number;
	pick_up_timer?: number;
	aiming_bow?: boolean;
	_recursive_refs_?: Array<[string[], string]>;

	constructor() {
		super();
		this.structure.addPoint("head");
		this.structure.addSegment({
			from: "head",
			name: "neck",
			length: 5
		});
		this.structure.addSegment({
			from: "neck",
			name: "sternum",
			length: 2
		});
		this.structure.addSegment({
			from: "sternum",
			name: "left shoulder",
			length: 2
		});
		this.structure.addSegment({
			from: "sternum",
			name: "right shoulder",
			length: 2
		});
		this.structure.addSegment({
			from: "left shoulder",
			to: "left elbow",
			name: "upper left arm",
			length: 10
		});
		this.structure.addSegment({
			from: "right shoulder",
			to: "right elbow",
			name: "upper right arm",
			length: 10
		});
		this.structure.addSegment({
			from: "left elbow",
			to: "left hand",
			name: "lower left arm",
			length: 10
		});
		this.structure.addSegment({
			from: "right elbow",
			to: "right hand",
			name: "lower right arm",
			length: 10
		});
		this.structure.addSegment({
			from: "sternum",
			to: "pelvis",
			name: "torso",
			length: 20
		});
		this.structure.addSegment({
			from: "pelvis",
			name: "left hip",
			length: 2
		});
		this.structure.addSegment({
			from: "pelvis",
			name: "right hip",
			length: 2
		});
		this.structure.addSegment({
			from: "left hip",
			to: "left knee",
			name: "upper left leg",
			length: 10
		});
		this.structure.addSegment({
			from: "right hip",
			to: "right knee",
			name: "upper right leg",
			length: 10
		});
		this.structure.addSegment({
			from: "left knee",
			to: "left foot",
			name: "lower left leg",
			length: 10
		});
		this.structure.addSegment({
			from: "right knee",
			to: "right foot",
			name: "lower right leg",
			length: 10
		});

		this.bbox_padding = 10;

		this.holding_bow = null;
		this.holding_arrows = [];
		this.riding = null;

		this.bow_drawn_to = 0;

		this.run_animation_position = 0;
		this.subtle_idle_animation_position = 0;
		this.other_idle_animation_position = 0;
		this.idle_animation = null;
		this.idle_timer = 0;

		this.smoothed_facing_x_for_eyes = this.upper_body_facing_x = this.lower_body_facing_x = this.facing_x = 1;
		this.looking_y = 0;
		this.landing_momentum = 0;

		this.hairs = [];
		for (let i = 0; i < 6; i++) {
			const hair: PointWithVelocity[] = [];
			for (let j = 0; j < 5; j++) {
				hair.push({ x: 0, y: 0, vx: 0, vy: 0 });
			}
			this.hairs.push(hair);
		}
		this.hair_initialized = false;
	}

	resolveReferences(world: World): void {
		if (this._recursive_refs_) {
			for (const [key_path, entity_id] of this._recursive_refs_) {
				const [...rest] = key_path;
				const last_key = rest.pop() as string;
				let obj: any = this;
				for (const key of rest) {
					obj = obj[key];
				}
				obj[last_key] = world.getEntityByID(entity_id);
			}
			delete this._recursive_refs_;
		}
		return;
	}

	toJSON(): any {
		const serialization_exclusions = ["_refs_", "_recursive_refs_", "reaching_for_segment", "reaching_for_entity", "reaching_with_secondary_hand", "ground_angle"];
		const _recursive_refs_: Array<[string[], string]> = [];
		
		const store_refs = (obj: any, key_path: string[] = []): any => {
			const obj_def: any = obj instanceof Array ? [] : {};
			for (const k in obj) {
				if (serialization_exclusions.includes(k)) continue;
				const v = obj[k];
				if (typeof v === "object" && v) {
					if (v instanceof PlayerEntity) {
						_recursive_refs_.push([[...key_path, k], v.id]);
					} else {
						const v_json = v.toJSON ? v.toJSON() : v;
						obj_def[k] = store_refs(v_json, [...key_path, k]);
					}
				} else {
					obj_def[k] = v;
				}
			}
			return obj_def;
		};
		
		const ent_def = store_refs(this);
		if (_recursive_refs_.length) {
			ent_def._recursive_refs_ = _recursive_refs_;
		}
		return ent_def;
	}

	step(world: World, view: View, mouse: Mouse): void {
		const { sternum } = this.structure.points;
		const from_point_in_world = this.toWorld(sternum);

		// mouse controls
		const mouse_in_world = view.toWorld(mouse);
		let aim_angle = Math.atan2(mouse_in_world.y - from_point_in_world.y, mouse_in_world.x - from_point_in_world.x);
		const mouse_prime_bow = mouse.RMB.down;
		const mouse_draw_bow = mouse.LMB.down;
		// keyboard controls
		let left = player_keyboard.isHeld("KeyA") || player_keyboard.isHeld("ArrowLeft");
		let right = player_keyboard.isHeld("KeyD") || player_keyboard.isHeld("ArrowRight");
		let up = player_keyboard.isHeld("KeyW") || player_keyboard.isHeld("ArrowUp");
		let down = player_keyboard.isHeld("KeyS") || player_keyboard.isHeld("ArrowDown");
		this.jump = player_keyboard.wasJustPressed("KeyW") || player_keyboard.wasJustPressed("ArrowUp");
		let mount_dismount = player_keyboard.wasJustPressed("KeyS") || player_keyboard.wasJustPressed("ArrowDown");
		// gamepad controls
		let gamepad_draw_bow = false;
		let gamepad_prime_bow = false;
		const gamepads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
		for (let i = 0; i < gamepads.length; i++) {
			const gamepad = gamepads[i];
			if (!gamepad) continue;
			left = left || gamepad.axes[0] < -0.5;
			right = right || gamepad.axes[0] > 0.5;
			up = up || gamepad.axes[1] < -0.5;
			down = down || gamepad.axes[1] > 0.5;
			this.jump = this.jump || (gamepad.buttons[0].pressed && !gamepad_jump_prev);
			mount_dismount = mount_dismount || (gamepad.buttons[1].pressed && !gamepad_mount_prev);
			gamepad_jump_prev = gamepad.buttons[0].pressed;
			gamepad_mount_prev = gamepad.buttons[1].pressed;
			gamepad_draw_bow = gamepad.buttons[7].pressed;

			if (Math.hypot(gamepad.axes[2], gamepad.axes[3]) > gamepad_detect_threshold) {
				gamepad_aiming = true;
			}
			if (gamepad_aiming) {
				aim_angle = Math.atan2(gamepad.axes[3], gamepad.axes[2]);
				aim_angle += TAU_PLAYER / 2;
				let draw_back_distance = Math.hypot(gamepad.axes[2], gamepad.axes[3]);
				draw_back_distance = Math.max(0, draw_back_distance - gamepad_deadzone);
				gamepad_prime_bow = draw_back_distance > 0.3;
			}
		}

		const prime_bow = this.holding_bow && (mouse_prime_bow || gamepad_prime_bow);
		const draw_bow = prime_bow && (mouse_draw_bow || gamepad_draw_bow);

		this.aiming_bow = prime_bow;

		const crouch = down && this.grounded && !this.riding;

		this.move_x = (right ? 1 : 0) - (left ? 1 : 0);
		this.move_y = (down ? 1 : 0) - (up ? 1 : 0);
		super.step(world);

		const pick_up_distance_threshold = 10;
		if (this.pick_up_timer === undefined) this.pick_up_timer = 0;
		this.pick_up_timer -= 1;
		
		const pick_up_any = (EntityClass: any, prop: string, use_secondary_hand: boolean = false, hold_many: boolean = false): void => {
			if (hold_many) {
				this[prop] = this[prop].filter((entity: any) => entity && !entity.destroyed);
			} else {
				if (this[prop]?.destroyed) this[prop] = null;
			}

			if (this.pick_up_timer! > 0) return;
			if (this[prop] && !hold_many) return;

			const entity_filter = (entity: any): boolean => {
				if (hold_many && this[prop].includes(entity)) {
					return false;
				}

				let moving_too_fast = false;
				if (entity.getAverageVelocity) {
					const [vx, vy] = entity.getAverageVelocity();
					if (Math.abs(vx) + Math.abs(vy) > 2) {
						moving_too_fast = true;
					}
				}
				return !moving_too_fast;
			};

			const primary_hand = this.structure.points["right hand"];
			const secondary_hand = this.structure.points["left hand"];
			const primary_shoulder = this.structure.points["right shoulder"];
			const secondary_shoulder = this.structure.points["left shoulder"];
			const hand = use_secondary_hand ? secondary_hand : primary_hand;
			const shoulder = use_secondary_hand ? secondary_shoulder : primary_shoulder;
			const hand_world = this.toWorld(hand);
			const shoulder_world = this.toWorld(shoulder);

			const near_hand = world.closest(hand_world, EntityClass, entity_filter);
			const near_shoulder = world.closest(shoulder_world, EntityClass, entity_filter);

			const nearest = near_hand.closest_dist < near_shoulder.closest_dist ? near_hand : near_shoulder;

			if (nearest.closest_dist < 50) {
				this.reaching_for_entity = nearest.closest_entity;
				this.reaching_for_segment = nearest.closest_segment;
				this.reaching_with_secondary_hand = use_secondary_hand;
				if (near_hand.closest_dist < pick_up_distance_threshold) {
					if (hold_many) {
						this[prop].push(near_hand.closest_entity);
					} else {
						this[prop] = near_hand.closest_entity;
					}
					this.pick_up_timer = 10;
				}
			}
		};

		this.reaching_for_entity = undefined;
		this.reaching_for_segment = undefined;
		this.reaching_with_secondary_hand = false;
		pick_up_any(PlayerBow, "holding_bow", true, false);
		pick_up_any(PlayerArrow, "holding_arrows", false, true);

		if (mount_dismount) {
			if (this.riding) {
				this.riding = null;
			} else {
				const search_result = world.closest(from_point_in_world, PlayerDeer);
				if (search_result.closest_dist < 30) {
					this.riding = search_result.closest_entity;
				}
			}
		}

		if (this.riding) {
			this.riding.move_x = this.move_x;
			this.riding.jump = this.jump;
			this.facing_x = this.riding.facing_x;
			const offset_distance = 20;
			this.x = this.riding.x + Math.sin(this.riding.ground_angle_smoothed) * offset_distance;
			this.y = this.riding.y - Math.cos(this.riding.ground_angle_smoothed) * offset_distance - 10;
			this.vx = this.riding.vx;
			this.vy = this.riding.vy;
		}

		const prevent_idle = (): void => {
			this.idle_timer = 0;
			this.idle_animation = null;
		};

		const more_submerged = this.submerged && world.collision({ x: this.x, y: this.y + this.height * 0.5 }, {
			types: (entity: any) => {
				return entity.constructor.name === "Water";
			}
		});

		let new_pose: any;
		if (this.riding) {
			new_pose = Player.poses[prime_bow ? "Riding Aiming" : "Riding"] ?? this.structure.getPose();
		} else if (more_submerged) {
			if (this.move_x === 0 && crouch) {
				new_pose = Player.poses["Crouch"];
				prevent_idle();
			} else if (this.move_x !== 0 && Player.animations["Swim"]) {
				this.run_animation_position += 0.1;
				new_pose = PlayerPose.lerpAnimationLoop(Player.animations["Swim"], this.run_animation_position);
			} else if (Player.animations["Tread Water"]) {
				this.run_animation_position -= 0.1 * this.move_y;
				new_pose = PlayerPose.lerpAnimationLoop(Player.animations["Tread Water"], this.run_animation_position);
			} else {
				new_pose = Player.poses["Stand"] ?? this.structure.getPose();
			}
		} else if (this.grounded) {
			if (this.move_x === 0) {
				if (crouch) {
					new_pose = Player.poses["Crouch"];
					prevent_idle();
				} else {
					this.idle_timer += 1;
					const subtle_idle_animation = Player.animations["Idle"];

					if (this.idle_timer > 1000) {
						this.idle_animation = "Yawn";
						this.idle_timer = 0;
						this.other_idle_animation_position = 0;
					}

					const other_idle_animation = this.idle_animation && Player.animations[this.idle_animation];

					if (other_idle_animation) {
						this.other_idle_animation_position += 1 / 25;
						if (this.other_idle_animation_position > other_idle_animation.length) {
							this.idle_animation = null;
						}
						new_pose = PlayerPose.lerpAnimationLoop(other_idle_animation, this.other_idle_animation_position);
					} else if (subtle_idle_animation) {
						this.subtle_idle_animation_position += 1 / 25;
						new_pose = PlayerPose.lerpAnimationLoop(subtle_idle_animation, this.subtle_idle_animation_position);
					} else {
						new_pose = Player.poses["Stand"] ?? this.structure.getPose();
					}
				}
			} else {
				prevent_idle();
				if (Player.animations["Run"]) {
					this.run_animation_position += Math.abs(this.move_x) / 5 * this.facing_x * this.lower_body_facing_x;
					new_pose = PlayerPose.lerpAnimationLoop(Player.animations["Run"], this.run_animation_position);
				} else {
					new_pose = this.structure.getPose();
				}
			}
		} else {
			prevent_idle();
			const slowing = Math.sign(this.move_x) === -Math.sign(this.vx);
			new_pose = slowing ? Player.poses["Jumping Back"] : null;
			new_pose = new_pose ?? Player.poses["Jumping"] ?? Player.poses["Stand"] ?? this.structure.getPose();
		}

		let upper_body_pose = PlayerPose.copy(new_pose);
		if (this.upper_body_facing_x < 0) {
			upper_body_pose = PlayerPose.horizontallyFlip(upper_body_pose);
		}

		let lower_body_pose = PlayerPose.copy(new_pose);
		if (this.lower_body_facing_x < 0) {
			lower_body_pose = PlayerPose.horizontallyFlip(lower_body_pose);
		}

		new_pose = PlayerPose.copy(new_pose);
		const lower_point_names = ["pelvis", "left hip", "right hip", "left knee", "right knee", "left foot", "right foot"];
		for (const point_name in new_pose.points) {
			if (lower_point_names.includes(point_name)) {
				new_pose.points[point_name] = lower_body_pose.points[point_name];
			} else {
				new_pose.points[point_name] = upper_body_pose.points[point_name];
			}
		}

		const head_x_before_posing = this.structure.points["head"].x;
		const head_y_before_posing = this.structure.points["head"].y;

		const ground_angle = this.riding?.ground_angle_smoothed ?? this.find_ground_angle(world);
		this.ground_angle = ground_angle;
		if (ground_angle !== undefined && isFinite(ground_angle)) {
			const center = { x: new_pose.points["pelvis"].x, y: new_pose.points["pelvis"].y };
			for (const point_name in new_pose.points) {
				const point = new_pose.points[point_name];
				let factor: number;
				if (this.riding) {
					factor = 1;
				} else {
					const max_y_diff = 2;
					factor = Math.max(0, Math.min(1, (point.y - center.y) / max_y_diff));
					factor *= 0.8;
				}
				point.x -= center.x;
				point.y -= center.y;
				const { x, y } = point;
				point.x = x * Math.cos(ground_angle) - y * Math.sin(ground_angle);
				point.y = x * Math.sin(ground_angle) + y * Math.cos(ground_angle);
				point.x += (x - point.x) * (1 - factor);
				point.y += (y - point.y) * (1 - factor);
				point.x += center.x;
				point.y += center.y;

				if (this.landing_momentum === undefined) this.landing_momentum = 0;
				this.landing_momentum *= 0.9;
				const gravity = 0.5;
				const squat_factor = Math.min(1, Math.max(0, this.landing_momentum - gravity));
				point.y += squat_factor * (1 - factor) * 15;
			}
		}

		const primary_hand = this.structure.points["right hand"];
		const secondary_hand = this.structure.points["left hand"];
		const primary_elbow = this.structure.points["right elbow"];
		const secondary_elbow = this.structure.points["left elbow"];
		const primary_shoulder = this.structure.points["right shoulder"];
		// const secondary_shoulder = this.structure.points["left shoulder"]; // unused

		if (this.reaching_for_entity) {
			const hand = this.reaching_with_secondary_hand ? secondary_hand : primary_hand;
			const pose_primary_shoulder = new_pose.points["right shoulder"];
			const pose_secondary_shoulder = new_pose.points["left shoulder"];
			const pose_shoulder = this.reaching_with_secondary_hand ? pose_secondary_shoulder : pose_primary_shoulder;
			const hand_world = this.toWorld(hand);
			const pose_shoulder_world = this.toWorld(pose_shoulder);
			const hand_world_soon = { x: hand_world.x + this.vx, y: hand_world.y + this.vy };
			const pose_shoulder_world_soon = { x: pose_shoulder_world.x + this.vx, y: pose_shoulder_world.y + this.vy };
			const a_world = this.reaching_for_entity.toWorld(this.reaching_for_segment!.a);
			const b_world = this.reaching_for_entity.toWorld(this.reaching_for_segment!.b);
			const c_world = closestPointOnLineSegmentPlayer(hand_world, a_world, b_world);
			const c_world_soon = closestPointOnLineSegmentPlayer(hand_world_soon, a_world, b_world);
			const arm_span = this.structure.segments["upper right arm"].length + this.structure.segments["lower right arm"].length;
			let dx = c_world.x - pose_shoulder_world.x;
			let dy = c_world.y - pose_shoulder_world.y;
			let distance_from_shoulder = Math.hypot(dx, dy);
			const dx_soon = c_world_soon.x - pose_shoulder_world_soon.x;
			const dy_soon = c_world_soon.y - pose_shoulder_world_soon.y;
			const distance_from_shoulder_soon = Math.hypot(dx_soon, dy_soon);

			const within_reach = distance_from_shoulder < arm_span + pick_up_distance_threshold * 0.9;
			const moving = Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1;
			const moving_towards_item = moving && distance_from_shoulder - distance_from_shoulder_soon > 0.1;

			if (within_reach || moving_towards_item) {
				distance_from_shoulder = Math.max(1, distance_from_shoulder);
				const reach_distance = Math.min(arm_span, distance_from_shoulder);
				const reach_point_world = {
					x: pose_shoulder_world.x + reach_distance * dx / distance_from_shoulder,
					y: pose_shoulder_world.y + reach_distance * dy / distance_from_shoulder
				};
				const reach_point_local = this.fromWorld(reach_point_world);
				const hand_x = reach_point_local.x;
				const hand_y = reach_point_local.y;
				let elbow_x = (hand_x + pose_shoulder.x) / 2;
				let elbow_y = (hand_y + pose_shoulder.y) / 2;
				const arm_angle = Math.atan2(hand_y - pose_shoulder.y, hand_x - pose_shoulder.x);
				const arm_extension = Math.hypot(hand_x - pose_shoulder.x, hand_y - pose_shoulder.y);
				let offset_angle = arm_angle + TAU_PLAYER / 4;
				const offset_distance = Math.abs(arm_span - arm_extension);
				if (Math.sin(offset_angle) < 0) {
					offset_angle += TAU_PLAYER / 2;
				}
				elbow_x += Math.cos(offset_angle) * offset_distance;
				elbow_y += Math.sin(offset_angle) * offset_distance;
				const pose_hand = new_pose.points[this.reaching_with_secondary_hand ? "left hand" : "right hand"];
				const pose_elbow = new_pose.points[this.reaching_with_secondary_hand ? "left elbow" : "right elbow"];
				pose_hand.x = hand_x;
				pose_hand.y = hand_y;
				pose_elbow.x = elbow_x;
				pose_elbow.y = elbow_y;
			}
		}

		this.structure.setPose(PlayerPose.lerp(this.structure.getPose(), new_pose, 0.3));

		this.upper_body_facing_x = this.facing_x;
		this.lower_body_facing_x = this.facing_x;
		this.looking_y = 0;

		if (prime_bow) {
			this.structure.points["head"].x = head_x_before_posing;
			this.structure.points["head"].y = head_y_before_posing;
		}

		if (this.holding_bow) {
			const bow = this.holding_bow;
			bow.x = this.x;
			bow.y = this.y;

			const arm_span = this.structure.segments["upper right arm"].length + this.structure.segments["lower right arm"].length;
			const max_draw_distance = 6;
			bow.draw_distance += ((max_draw_distance * (draw_bow ? 1 : 0)) - bow.draw_distance) / 15;

			const draw_to = arm_span - bow.fistmele - bow.draw_distance;

			if (draw_bow) {
				bow.draw_distance += (5 - bow.draw_distance) / 5;
				this.bow_drawn_to = draw_to;
			} else {
				const arrow = this.holding_arrows[0];
				if (prime_bow && arrow && bow.draw_distance > 2 && !world.collision(
					arrow.toWorld(arrow.structure.points["tip"])
				) && !world.collision(
					arrow.toWorld(arrow.structure.points["nock"])
				)) {
					const force = bow.draw_distance * 2;
					arrow.setVelocity(
						Math.cos(aim_angle) * force + this.vx,
						Math.sin(aim_angle) * force + this.vy
					);
					const index = this.holding_arrows.indexOf(arrow);
					if (index >= 0) this.holding_arrows.splice(index, 1);
				}
				bow.draw_distance = 0;
				this.bow_drawn_to += (arm_span - bow.fistmele - this.bow_drawn_to) / 10;
			}

			if (prime_bow) {
				prevent_idle();
				// const bow_angle = aim_angle; // unused in this scope

				let primary_shoulder_dx = this.structure.points["right shoulder"].x - this.structure.points["sternum"].x;
				let primary_shoulder_dy = this.structure.points["right shoulder"].y - this.structure.points["sternum"].y;
				let secondary_shoulder_dx = this.structure.points["left shoulder"].x - this.structure.points["sternum"].x;
				let secondary_shoulder_dy = this.structure.points["left shoulder"].y - this.structure.points["sternum"].y;
				let primary_shoulder_dist = Math.hypot(primary_shoulder_dx, primary_shoulder_dy);
				let secondary_shoulder_dist = Math.hypot(secondary_shoulder_dx, secondary_shoulder_dy);
				primary_shoulder_dist = Math.max(primary_shoulder_dist, 1);
				secondary_shoulder_dist = Math.max(secondary_shoulder_dist, 1);
				const wide_shoulder_dist = 4;
				const widening_factor = 1;
				const new_primary_shoulder_dist = primary_shoulder_dist + (wide_shoulder_dist - primary_shoulder_dist) * widening_factor;
				const new_secondary_shoulder_dist = secondary_shoulder_dist + (wide_shoulder_dist - secondary_shoulder_dist) * widening_factor;
				primary_shoulder_dx *= new_primary_shoulder_dist / primary_shoulder_dist;
				primary_shoulder_dy *= new_primary_shoulder_dist / primary_shoulder_dist;
				secondary_shoulder_dx *= new_secondary_shoulder_dist / secondary_shoulder_dist;
				secondary_shoulder_dy *= new_secondary_shoulder_dist / secondary_shoulder_dist;
				this.structure.points["right shoulder"].x = this.structure.points["sternum"].x + primary_shoulder_dx;
				this.structure.points["left shoulder"].x = this.structure.points["sternum"].x + secondary_shoulder_dx;

				primary_hand.x = sternum.x + this.bow_drawn_to * Math.cos(aim_angle);
				primary_hand.y = sternum.y + this.bow_drawn_to * Math.sin(aim_angle);
				primary_elbow.x = (primary_hand.x + primary_shoulder.x) / 2;
				primary_elbow.y = (primary_hand.y + primary_shoulder.y) / 2;

				secondary_hand.x = sternum.x + arm_span * Math.cos(aim_angle);
				secondary_hand.y = sternum.y + arm_span * Math.sin(aim_angle);
				secondary_elbow.x = sternum.x + 15 * Math.cos(aim_angle);
				secondary_elbow.y = sternum.y + 15 * Math.sin(aim_angle);

				// CoffeeScript's %% operator is a modulo that always returns positive
				const mod = (n: number, m: number) => ((n % m) + m) % m;
				let angle = mod(aim_angle - TAU_PLAYER / 4, TAU_PLAYER);
				this.upper_body_facing_x = angle < TAU_PLAYER / 2 ? -1 : 1;
				if (!this.riding) {
					this.lower_body_facing_x = this.upper_body_facing_x;
				}
				this.upper_body_facing_x = Math.cos(aim_angle);
				this.looking_y = -(Math.sin(aim_angle) ** 4) * Math.sign(Math.sin(aim_angle)) * 2;

				angle = Math.sin(aim_angle * 2) * TAU_PLAYER / 8;
				angle = mod(angle - TAU_PLAYER / 4, TAU_PLAYER);

				const { head, neck } = this.structure.points;
				const new_head_x = sternum.x + 7 * Math.cos(angle + (angle < TAU_PLAYER / 2 ? TAU_PLAYER / 2 : 0));
				const new_head_y = sternum.y + 7 * Math.sin(angle + (angle < TAU_PLAYER / 2 ? TAU_PLAYER / 2 : 0));
				let new_neck_x = sternum.x + 2 * Math.cos(angle + (angle < TAU_PLAYER / 2 ? TAU_PLAYER / 2 : 0));
				let new_neck_y = sternum.y + 2 * Math.sin(angle + (angle < TAU_PLAYER / 2 ? TAU_PLAYER / 2 : 0));
				const neck_lerp_factor = 0.3;
				const pose_neck = new_pose.points.neck;
				new_neck_x += (pose_neck.x - new_neck_x) * neck_lerp_factor;
				new_neck_y += (pose_neck.y - new_neck_y) * neck_lerp_factor;

				const lerp_factor = 1;
				head.x += (new_head_x - head.x) * lerp_factor;
				head.y += (new_head_y - head.y) * lerp_factor;
				neck.x += (new_neck_x - neck.x) * lerp_factor;
				neck.y += (new_neck_y - neck.y) * lerp_factor;
				if (this.holding_arrows.length > 1) {
					this.holding_arrows.length = 1;
				}
			} else {
				// const bow_angle = Math.atan2(secondary_hand.y - secondary_elbow.y, secondary_hand.x - secondary_elbow.x); // unused
			}

			// const primary_hand_in_bow_space = bow.fromWorld(this.toWorld(primary_hand)); // unused
			const secondary_hand_in_bow_space = bow.fromWorld(this.toWorld(secondary_hand));
			bow.structure.points.grip.x = secondary_hand_in_bow_space.x;
			bow.structure.points.grip.y = secondary_hand_in_bow_space.y;
			if (prime_bow) {
				bow.structure.points.serving.x = sternum.x + draw_to * Math.cos(aim_angle);
				bow.structure.points.serving.y = sternum.y + draw_to * Math.sin(aim_angle);
			} else {
				const bow_angle = Math.atan2(secondary_hand.y - secondary_elbow.y, secondary_hand.x - secondary_elbow.x);
				bow.structure.points.serving.x = bow.structure.points.grip.x - bow.fistmele * Math.cos(bow_angle);
				bow.structure.points.serving.y = bow.structure.points.grip.y - bow.fistmele * Math.sin(bow_angle);
			}

			const the_world = world as any;
			let bow_index = the_world.entities.indexOf(bow);
			let player_index = the_world.entities.indexOf(this);
			if (prime_bow) {
				if (bow_index < player_index) {
					the_world.entities.splice(bow_index, 1);
					player_index = the_world.entities.indexOf(this);
					the_world.entities.splice(player_index + 1, 0, bow);
				}
			} else {
				if (bow_index > player_index) {
					the_world.entities.splice(bow_index, 1);
					player_index = the_world.entities.indexOf(this);
					the_world.entities.splice(player_index, 0, bow);
				}
			}
		}

		for (let arrow_index = 0; arrow_index < this.holding_arrows.length; arrow_index++) {
			const arrow = this.holding_arrows[arrow_index];
			arrow.lodging_constraints.length = 0;
			arrow.x = this.x;
			arrow.y = this.y;
			const primary_hand_in_arrow_space = arrow.fromWorld(this.toWorld(primary_hand));
			// const secondary_hand_in_arrow_space = arrow.fromWorld(this.toWorld(secondary_hand)); // unused
			if (prime_bow) {
				const arm_span = this.structure.segments["upper right arm"].length + this.structure.segments["lower right arm"].length;
				const draw_to = arm_span - this.holding_bow.fistmele - this.holding_bow.draw_distance;
				arrow.structure.points.nock.x = sternum.x + draw_to * Math.cos(aim_angle);
				arrow.structure.points.nock.y = sternum.y + draw_to * Math.sin(aim_angle);
				arrow.structure.points.tip.x = sternum.x + (draw_to + arrow.length) * Math.cos(aim_angle);
				arrow.structure.points.tip.y = sternum.y + (draw_to + arrow.length) * Math.sin(aim_angle);
			} else {
				const angle = Math.atan2(primary_hand.y - sternum.y, primary_hand.x - sternum.x);
				let arrow_angle = angle - (TAU_PLAYER / 4 + 0.2) * this.upper_body_facing_x;
				let hold_offset = -5;
				hold_offset -= Math.min(this.holding_arrows.length - 1, 3);
				let fan_angle = ((arrow_index % 2) - 1 / 2) * arrow_index * 0.4;
				if (this.holding_arrows.length > 3) {
					fan_angle *= Math.pow(0.9, this.holding_arrows.length);
				}
				if (Math.abs(this.vx) > 2) {
					fan_angle *= 0.7;
				}
				arrow_angle += fan_angle;
				hold_offset += Math.sin(arrow_index ** 1.2) * Math.pow(arrow_index, 0.9) * 0.3;
				arrow_angle += Math.sin(this.x / 10 + arrow_index * 0.1) * Math.cos(this.y / 10 + arrow_index * 0.5) * 0.01 * this.vx;

				arrow.structure.points.nock.x = primary_hand_in_arrow_space.x + hold_offset * Math.cos(arrow_angle);
				arrow.structure.points.nock.y = primary_hand_in_arrow_space.y + hold_offset * Math.sin(arrow_angle);
				arrow.structure.points.tip.x = primary_hand_in_arrow_space.x + (hold_offset + arrow.length) * Math.cos(arrow_angle);
				arrow.structure.points.tip.y = primary_hand_in_arrow_space.y + (hold_offset + arrow.length) * Math.sin(arrow_angle);
			}

			arrow.setVelocity(0, 0);
		}

		this.simulate_hair(world);

		this.smoothed_facing_x_for_eyes += (this.upper_body_facing_x - this.smoothed_facing_x_for_eyes) / 5;

		return;
	}

	simulate_hair(world?: World): void {
		const { head, neck } = this.structure.points;
		const head_angle = Math.atan2(head.y - neck.y, head.x - neck.x);
		const head_global = this.toWorld(head);

		const hair_iterations = 1;
		const air_friction = 0.2;
		const water_friction = 0.2;
		const hair_length = 30;

		for (let iter = 0; iter <= hair_iterations; iter++) {
			for (const points of this.hairs) {
				for (const point of points) {
					point.prev_x = point.x;
					point.prev_y = point.y;
				}
			}

			for (let hair_index = 0; hair_index < this.hairs.length; hair_index++) {
				const points = this.hairs[hair_index];
				const a = head_angle + hair_index / this.hairs.length * TAU_PLAYER / 2 - TAU_PLAYER / 4;
				const back_x = Math.sin(head_angle) * 2 * this.upper_body_facing_x;
				const back_y = Math.cos(head_angle) * 2 * this.upper_body_facing_x;
				points[0].x = head_global.x + Math.cos(a) * 3 + back_x;
				points[0].y = head_global.y + Math.sin(a) * 3 + back_y;
				const seg_length = (hair_length + (Math.cos(a - head_angle) - 0.5) * 5) / points.length;
				for (let i = 1; i < points.length; i++) {
					if (!this.hair_initialized) {
						points[i].x = points[i - 1].x;
						points[i].y = points[i - 1].y + seg_length;
						points[i].prev_x = points[i].x;
						points[i].prev_y = points[i].y;
					}
					const gravity = 0.5;
					const submerged = world?.collision(points[i], {
						types: (entity: any) => {
							return entity.constructor.name === "Water";
						}
					});
					const buoyancy = submerged ? 0.6 : 0;
					const fluid_friction = submerged ? water_friction : air_friction;
					points[i].vy += (gravity - buoyancy) / hair_iterations;
					points[i].vx *= (1 - fluid_friction);
					points[i].vy *= (1 - fluid_friction);
					if (submerged) {
						points[i].vx += Math.sin(Math.sin(performance.now() ** 1.2 / 1000 + Math.sin(points[i].y / 30)) * 40 + points[i].x + Math.sin(points[i].y / 30)) * 0.05;
						points[i].vy += Math.cos(Math.sin(performance.now() ** 1.2 / 1000 + Math.sin(points[i].y / 30)) * 40 + points[i].x + Math.sin(points[i].y / 30)) * 0.05;
					}
					points[i].x += points[i].vx;
					points[i].y += points[i].vy;
					const delta_x = points[i].x - points[i - 1].x;
					const delta_y = points[i].y - points[i - 1].y;
					const delta_length = Math.hypot(delta_x, delta_y);
					const diff = (delta_length - seg_length) / delta_length;
					if (isFinite(diff) && delta_length > seg_length) {
						points[i].x -= delta_x * diff;
						points[i].y -= delta_y * diff;
					} else if (!isFinite(diff)) {
						console.warn("diff is not finite, for hair segment distance constraint");
					}
				}
			}

			for (const points of this.hairs) {
				for (const point of points) {
					point.vx = point.x - (point.prev_x ?? point.x);
					point.vy = point.y - (point.prev_y ?? point.y);
				}
			}

			this.hair_initialized = true;
		}

		return;
	}

	draw(ctx: CanvasRenderingContext2D, view: View): void {
		const { head, sternum, pelvis } = this.structure.points;
		const left_knee = this.structure.points["left knee"];
		const right_knee = this.structure.points["right knee"];
		const left_shoulder = this.structure.points["left shoulder"];
		const right_shoulder = this.structure.points["right shoulder"];

		const skin_color = "#6B422C";
		const hair_color = "#000000";
		const eye_color = "#000000";
		const dress_color = "#AAFFFF";

		if (view.is_preview || !this.hair_initialized) {
			this.simulate_hair();
			if (!view.is_preview) {
				this.hair_initialized = false;
			}
		}
		for (let hair_index = 0; hair_index < this.hairs.length; hair_index++) {
			const hair_points = this.hairs[hair_index];
			ctx.beginPath();
			const local_point_0 = this.fromWorld(hair_points[0]);
			ctx.moveTo(local_point_0.x, local_point_0.y);
			for (let i = 1; i < hair_points.length; i++) {
				const local_point = this.fromWorld(hair_points[i]);
				ctx.lineTo(local_point.x, local_point.y);
			}
			ctx.lineWidth = 2;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = hair_color;
			ctx.stroke();
		}

		const in_front_segment_names = ["upper right arm", "lower right arm"];
		if (this.aiming_bow) {
			in_front_segment_names.push("upper left arm", "lower left arm");
		}
		const behind_dress_segment_names = Object.keys(this.structure.segments).filter((segment_name) =>
			!in_front_segment_names.includes(segment_name)
		);
		const draw_limbs = (segment_names: string[]): void => {
			for (const segment_name of segment_names) {
				const segment = this.structure.segments[segment_name];
				ctx.beginPath();
				ctx.moveTo(segment.a.x, segment.a.y);
				ctx.lineTo(segment.b.x, segment.b.y);
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.strokeStyle = skin_color;
				ctx.stroke();
			}
		};
		draw_limbs(behind_dress_segment_names);

		ctx.beginPath();
		ctx.save();
		ctx.translate(sternum.x, sternum.y);
		const torso_angle = Math.atan2(pelvis.y - sternum.y, pelvis.x - sternum.x) - TAU_PLAYER / 4;
		const torso_length = player_distance(pelvis, sternum);
		ctx.rotate(torso_angle);
		const left_leg_angle = Math.atan2(left_knee.y - pelvis.y, left_knee.x - pelvis.x) - torso_angle;
		const right_leg_angle = Math.atan2(right_knee.y - pelvis.y, right_knee.x - pelvis.x) - torso_angle;
		const left_shoulder_angle = Math.atan2(left_shoulder.y - sternum.y, left_shoulder.x - sternum.x) - torso_angle;
		const right_shoulder_angle = Math.atan2(right_shoulder.y - sternum.y, right_shoulder.x - sternum.x) - torso_angle;
		const shoulder_distance = player_distance(left_shoulder, sternum);
		const min_shoulder_cos = Math.min(Math.cos(left_shoulder_angle), Math.cos(right_shoulder_angle));
		const max_shoulder_cos = Math.max(Math.cos(left_shoulder_angle), Math.cos(right_shoulder_angle));
		let min_cos_shoulder_angle: number;
		let max_cos_shoulder_angle: number;
		if (Math.cos(left_shoulder_angle) < Math.cos(right_shoulder_angle)) {
			min_cos_shoulder_angle = left_shoulder_angle;
			max_cos_shoulder_angle = right_shoulder_angle;
		} else {
			min_cos_shoulder_angle = right_shoulder_angle;
			max_cos_shoulder_angle = left_shoulder_angle;
		}
		ctx.lineTo(-2 + Math.min(0, 1 * min_shoulder_cos), Math.sin(min_cos_shoulder_angle) * shoulder_distance - 1.5);
		ctx.lineTo(+2 + Math.max(0, 1 * max_shoulder_cos), Math.sin(max_cos_shoulder_angle) * shoulder_distance - 1.5);
		const min_cos = Math.min(Math.cos(left_leg_angle), Math.cos(right_leg_angle));
		const max_cos = Math.max(Math.cos(left_leg_angle), Math.cos(right_leg_angle));
		// const min_sin = Math.min(Math.sin(left_leg_angle), Math.sin(right_leg_angle)); // unused
		const max_sin = Math.max(Math.sin(left_leg_angle), Math.sin(right_leg_angle));
		ctx.lineTo(+4 + Math.max(0, 1 * max_cos), torso_length / 2);
		ctx.lineTo(+4 + Math.max(0, 9 * max_cos), torso_length + Math.max(5, 7 * max_sin));
		ctx.lineTo(-4 + Math.min(0, 9 * min_cos), torso_length + Math.max(5, 7 * max_sin));
		ctx.lineTo(-4 + Math.min(0, 1 * min_cos), torso_length / 2);
		ctx.fillStyle = dress_color;
		ctx.fill();
		ctx.restore();

		const head_radius_y = 5.5;
		const head_radius_x = head_radius_y * 0.9;
		const hair_radius = head_radius_y;
		ctx.save();
		ctx.translate(head.x, head.y);
		ctx.rotate(Math.atan2(head.y - sternum.y, head.x - sternum.x) - TAU_PLAYER / 4);
		ctx.beginPath();
		ctx.arc(0, 0, hair_radius, 0, TAU_PLAYER / 2);
		ctx.save();
		ctx.scale(1, 0.5);
		ctx.arc(0, 0, hair_radius, TAU_PLAYER / 2, TAU_PLAYER);
		ctx.restore();
		ctx.fillStyle = hair_color;
		ctx.fill();
		ctx.save();
		ctx.scale(head_radius_x / head_radius_y, 1);
		ctx.beginPath();
		ctx.arc(0, 0, head_radius_y, 0, TAU_PLAYER);
		ctx.fillStyle = skin_color;
		ctx.fill();
		ctx.clip();
		ctx.scale(head_radius_y / head_radius_x, 1);
		const eye_y = this.looking_y - 1;
		const eye_radius = 1;
		const eye_spacing = 0.6;
		const turn_limit = TAU_PLAYER / 8;
		ctx.fillStyle = eye_color;
		for (const eye_signature of [-1, 1]) {
			const head_rotation_angle = this.smoothed_facing_x_for_eyes * turn_limit;
			const eye_x = Math.sin(eye_spacing * eye_signature - head_rotation_angle) * head_radius_x;
			ctx.beginPath();
			ctx.arc(eye_x, eye_y, eye_radius, 0, TAU_PLAYER);
			ctx.fill();
		}
		ctx.restore();
		ctx.beginPath();
		ctx.arc(0, 0, hair_radius, 0, TAU_PLAYER / 2);
		ctx.scale(1, 0.01 - this.looking_y / 5);
		ctx.arc(0, 0, hair_radius, TAU_PLAYER / 2, TAU_PLAYER);
		ctx.fillStyle = hair_color;
		ctx.fill();
		ctx.restore();

		draw_limbs(in_front_segment_names);

		return;
	}
}

addPlayerEntityClass(Player);
PlayerEntity.initAnimation(Player);

module.exports = Player;
