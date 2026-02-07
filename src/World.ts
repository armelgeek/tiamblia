const EntityClass = require("./entities/abstract/Entity.coffee");
const Terrain = require("./entities/abstract/Terrain.ts");
const { distanceToLineSegment: distanceToLineSegmentHelper } = require("skele2d").helpers;
const hsl_to_rgb_hex = require("./hsl-to-rgb-hex.js");

declare const PolyK: any;

interface Point {
	x: number;
	y: number;
}

interface BBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface EntityDef {
	_class_: string;
	id: string;
	x: number;
	y: number;
	structure: any;
	[key: string]: any;
}

interface WorldDef {
	format?: string;
	formatVersion?: number;
	entities: EntityDef[];
}

interface CollisionOptions {
	types?: any[] | ((entity: any) => boolean);
	lineThickness?: number;
}

interface ClosestResult {
	closest_entity: any | null;
	closest_dist: number;
	closest_segment: any | null;
}

interface ProjectResult {
	closest_point_in_world: Point;
	closest_point_in_hit_space: Point;
	closest_segment: any;
}

interface ProjectOptions {
	types?: any[];
	outsideEntity?: any;
}

function worldClosestPointOnLineSegment(point: Point, a: Point, b: Point): Point {
	const a_to_p = { x: point.x - a.x, y: point.y - a.y };
	const a_to_b = { x: b.x - a.x, y: b.y - a.y };
	const atb2 = a_to_b.x ** 2 + a_to_b.y ** 2;
	const atp_dot_atb = a_to_p.x * a_to_b.x + a_to_p.y * a_to_b.y;
	let t = atp_dot_atb / atb2;
	t = Math.max(0, Math.min(1, t));
	return { x: a.x + a_to_b.x * t, y: a.y + a_to_b.y * t };
}

const bucket_width = 100;
const bucket_height = 100;
const count_hit_tests = (function() {
	try {
		return localStorage["tiamblia.count_hit_tests"] === "true";
	} catch {
		return false;
	}
})();

class World {
	entities: any[];
	derived_colliders: any[];
	collision_buckets?: { [bx: string]: { [by: string]: any[] } };
	hit_test_counts?: { [bx: string]: { [by: string]: number } };
	bg?: HTMLCanvasElement;

	static format = "Tiamblia World";
	static formatVersion = 15;

	constructor() {
		this.entities = [];
		this.derived_colliders = [];
	}

	toJSON(): WorldDef {
		return {
			format: World.format,
			formatVersion: World.formatVersion,
			entities: this.entities
		};
	}

	fromJSON(def: WorldDef): void {
		if (def.format !== World.format) {
			if (def.format) {
				throw new Error(`Expected format to be "${World.format}", got ${def.format}`);
			}
		}

		const upgrading_from_version = def.formatVersion;
		if (!def.formatVersion) {
			if (!(def.entities instanceof Array)) {
				throw new Error(`Expected entities to be an array, got ${def.entities}`);
			}
			def.formatVersion = 1;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Arrow") {
					ent_def.structure.points.nock.prev_x = ent_def.structure.points.nock.x - ent_def.structure.points.nock.vx;
					ent_def.structure.points.nock.prev_y = ent_def.structure.points.nock.y - ent_def.structure.points.nock.vy;
					ent_def.structure.points.tip.prev_x = ent_def.structure.points.tip.x - ent_def.structure.points.tip.vx;
					ent_def.structure.points.tip.prev_y = ent_def.structure.points.tip.y - ent_def.structure.points.tip.vy;
					delete ent_def.structure.points.nock.vx;
					delete ent_def.structure.points.nock.vy;
					delete ent_def.structure.points.tip.vx;
					delete ent_def.structure.points.tip.vy;
				}
			}
		}
		if (def.formatVersion === 1) {
			def.formatVersion = 2;
			def.entities = JSON.parse(JSON.stringify(def.entities).replace(/\belbo\b/g, 'elbow'));
		}
		if (def.formatVersion === 2) {
			def.formatVersion = 3;
			for (const ent_def of def.entities) {
				if (ent_def._class_.includes("Tree")) {
					for (const point_name in ent_def.structure.points) {
						const point_def = ent_def.structure.points[point_name];
						point_def.is_leaf = ent_def.leaf_point_names.includes(point_name);
					}
					delete ent_def.leaf_point_names;
				}
			}
		}
		if (def.formatVersion === 3) {
			def.formatVersion = 4;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Caterpillar") {
					let average_x = 0;
					let average_y = 0;
					for (const point_name in ent_def.structure.points) {
						const point_def = ent_def.structure.points[point_name];
						average_x += point_def.x;
						average_y += point_def.y;
					}
					average_x /= Object.keys(ent_def.structure.points).length;
					average_y /= Object.keys(ent_def.structure.points).length;
					ent_def.x += average_x;
					ent_def.y += average_y;
					delete ent_def.structure;
				}
			}
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Player") {
					ent_def.holding_arrows = [];
					if (ent_def.holding_arrow) {
						ent_def.holding_arrows.push(ent_def.holding_arrow);
					}
					delete ent_def.holding_arrow;
				}
			}
		}
		if (def.formatVersion === 4) {
			def.formatVersion = 5;
			for (const ent_def of def.entities) {
				if (ent_def.intangible_because_optimized) {
					delete ent_def.intangible;
					delete ent_def.intangible_because_optimized;
				}
			}
		}
		if (def.formatVersion === 5) {
			def.formatVersion = 6;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Player") {
					delete ent_def.reaching_for_segment;
					delete ent_def.reaching_for_entity;
					delete ent_def.reaching_with_secondary_hand;
					delete ent_def.ground_angle;
					delete ent_def.smoothed_vy;
					delete ent_def.hair_x_scales;
				}
			}
		}
		if (def.formatVersion === 6) {
			def.formatVersion = 7;
			const to_hex_if_hsl = (color: string): string => {
				if (color.match(/hsl/i)) {
					return hsl_to_rgb_hex(color);
				}
				return color;
			};
			for (const ent_def of def.entities) {
				if (["Frog", "Deer", "Rabbit"].includes(ent_def._class_)) {
					ent_def.body_color = to_hex_if_hsl(ent_def.c);
					delete ent_def.c;
				}
			}
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Rabbit") {
					ent_def.body_shadow_color = to_hex_if_hsl(ent_def.c2);
					delete ent_def.c2;
				}
			}
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Butterfly") {
					ent_def.color_1 = to_hex_if_hsl(ent_def.c1);
					delete ent_def.c1;
					ent_def.color_2 = to_hex_if_hsl(ent_def.c2);
					delete ent_def.c2;
				}
			}
		}
		if (def.formatVersion === 7) {
			def.formatVersion = 8;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Player") {
					ent_def._refs_ = ent_def._refs_ || {};
					for (const prop in ent_def) {
						if (ent_def[prop]?._class_) {
							ent_def._refs_[prop] = ent_def[prop].id;
							delete ent_def[prop];
						}
					}
				}
			}
		}
		if (def.formatVersion === 8) {
			def.formatVersion = 9;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Player") {
					if (ent_def._refs_) {
						ent_def._recursive_refs_ = [];
						for (const key in ent_def._refs_) {
							const id = ent_def._refs_[key];
							ent_def._recursive_refs_.push([[key], id]);
						}
						delete ent_def._refs_;
					}
					if (ent_def.holding_arrows) {
						ent_def._recursive_refs_ = ent_def._recursive_refs_ || [];
						for (let i = 0; i < ent_def.holding_arrows.length; i++) {
							const arrow_def = ent_def.holding_arrows[i];
							ent_def._recursive_refs_.push([["holding_arrows", i], arrow_def.id]);
						}
						ent_def.holding_arrows = [];
					}
				}
			}
		}
		if (def.formatVersion === 9) {
			def.formatVersion = 10;
			for (const ent_def of def.entities) {
				if (["GrassyTerrain", "LushGrass", "SavannaGrass"].includes(ent_def._class_)) {
					delete ent_def.grass_tiles;
				}
			}
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Water") {
					if (ent_def.waves && !ent_def.waves_y) {
						ent_def.waves_y = ent_def.waves;
					}
					delete ent_def.waves;
					delete ent_def.ccw;
					delete ent_def.min_x;
					delete ent_def.max_x;
					delete ent_def.min_y;
					delete ent_def.max_y;
				}
			}
		}
		if (def.formatVersion === 10) {
			def.formatVersion = 11;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Deer") {
					if (ent_def.dir_pl != null) {
						ent_def.smoothed_facing_x = ent_def.dir_pl;
					}
					delete ent_def.dir_pl;
					if (ent_def.dir_p != null) {
						ent_def.facing_x = ent_def.dir_p;
					}
					delete ent_def.dir_p;
				}
			}
		}
		if (def.formatVersion === 11) {
			def.formatVersion = 12;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Deer") {
					if (ent_def.dir != null) {
						ent_def.move_x = ent_def.dir;
					}
					delete ent_def.dir;
				}
			}
		}
		if (def.formatVersion === 12) {
			def.formatVersion = 13;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Deer") {
					if (ent_def.xp != null) {
						ent_def.x_prev = ent_def.xp;
					}
					delete ent_def.xp;
					if (ent_def.t != null) {
						ent_def.idle_timer = ent_def.t;
					}
					delete ent_def.t;
					if (ent_def.lr != null) {
						ent_def.leg_rotation = ent_def.lr;
					}
					delete ent_def.lr;
				}
			}
		}
		if (def.formatVersion === 13) {
			def.formatVersion = 14;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Player") {
					if (ent_def.real_facing_x != null) {
						ent_def.upper_body_facing_x = ent_def.real_facing_x;
						ent_def.lower_body_facing_x = ent_def.real_facing_x;
					}
					delete ent_def.real_facing_x;
					if (ent_def.prev_real_facing_x != null) {
						ent_def.prev_upper_body_facing_x = ent_def.prev_real_facing_x;
					}
					delete ent_def.prev_real_facing_x;
				}
			}
		}
		if (def.formatVersion === 14) {
			def.formatVersion = 15;
			for (const ent_def of def.entities) {
				if (ent_def._class_ === "Player") {
					delete ent_def.prev_upper_body_facing_x;
					delete ent_def.facing_turn_timer;
				}
			}
		}

		if (def.formatVersion! > World.formatVersion) {
			if (def.formatVersion! > upgrading_from_version!) {
				throw new Error(`You forgot to update World.formatVersion to ${def.formatVersion} when adding an upgrade step!`);
			}
			throw new Error(`The format version ${def.formatVersion} is too new for this version of the game.`);
		}
		if (def.formatVersion !== World.formatVersion) {
			throw new Error(`Unsupported format version ${def.formatVersion}`);
		}

		if (!(def.entities instanceof Array)) {
			throw new Error(`Expected entities to be an array, got ${def.entities}`);
		}
		for (let i = 0; i < def.entities.length; i++) {
			const ent_def = def.entities[i];
			if (typeof ent_def._class_ !== "string") {
				throw new Error(`Expected entities[${i}]._class_ to be a string, got ${ent_def._class_}`);
			}
			if (typeof ent_def.id !== "string") {
				throw new Error(`Expected entities[${i}].id to be a string, got ${ent_def.id}`);
			}
			if (typeof ent_def.x !== "number") {
				throw new Error(`Expected entities[${i}].x to be a number, got ${ent_def.x}`);
			}
			if (typeof ent_def.y !== "number") {
				throw new Error(`Expected entities[${i}].y to be a number, got ${ent_def.y}`);
			}
			if (typeof ent_def.structure !== "object") {
				throw new Error(`Expected entities[${i}].structure to be an object, got ${ent_def.structure}`);
			}
			const dot_or_bracket = (key: string): string => {
				if (key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
					return `.${key}`;
				} else if (key.match(/^[0-9]+$/)) {
					return `[${key}]`;
				} else {
					return `[${JSON.stringify(key)}]`;
				}
			};
			const search_object = (obj: any, path_to_obj: string, get_more_context: () => [string, any]): void => {
				if (typeof obj === "object" && obj !== null) {
					for (const key in obj) {
						const value = obj[key];
						const path_to_value = `${path_to_obj}${dot_or_bracket(key)}`;
						if (key === "_class_") {
							throw new Error(`Entity references must be at the top level of an entity, but found ${path_to_value} = ${JSON.stringify(value)} ${get_more_context()[0]} ${JSON.stringify(get_more_context()[1])}`);
						}
						if (typeof value === "object" && value !== null) {
							search_object(value, path_to_value, get_more_context);
						}
					}
				}
			};
			for (const top_key in ent_def) {
				const top_value = ent_def[top_key];
				search_object(top_value, `entities[${i}]${dot_or_bracket(top_key)}`, () => [`where entities[${i}] is ${ent_def._class_}`, ent_def]);
			}
		}

		this.entities = def.entities.map((ent_def: EntityDef) => EntityClass.fromJSON(ent_def));
		for (const entity of this.entities) {
			entity.resolveReferences(this);
		}
	}

	getEntityByID(id: string): any | null {
		for (const entity of this.entities) {
			if (entity.id === id) {
				return entity;
			}
		}
		return null;
	}

	getEntitiesOfType(Class: any): any[] {
		return this.entities.filter((entity) => entity instanceof Class);
	}

	drawBackground(ctx: CanvasRenderingContext2D, view: any): void {
		ctx.fillStyle = "#32C8FF";
		ctx.fillRect(0, 0, view.width, view.height);
		if (!this.bg) {
			this.bg = document.createElement("canvas");
			this.bg.width = 5000;
			this.bg.height = 800;
			this.drawMountains(this.bg.getContext("2d")!);
		}
		ctx.drawImage(this.bg, (-view.center_x - 5000 / 2) / 2, 500 - view.center_y / 5);
	}

	drawMountains(ctx: CanvasRenderingContext2D): void {
		const green = false;
		if (green) {
			ctx.fillStyle = `hsla(155,${90 - (Math.random() * 6)}%,${59 - (Math.random() * 6)}%,1)`;
		} else {
			ctx.fillStyle = `hsla(205,${90 - (Math.random() * 6)}%,${69 - (Math.random() * 6)}%,1)`;
		}
		ctx.fillRect(0, 100, ctx.canvas.width, ctx.canvas.height);
		let i = 0;
		while (i < 3) {
			if (green) {
				ctx.fillStyle = `hsla(155,${80 - (i * 10) - (Math.random() * 6)}%,${65 - (i * 0) - (Math.random() * 6)}%,1)`;
			} else {
				ctx.fillStyle = `hsla(205,${80 - (i * 10) - (Math.random() * 6)}%,${65 - (i * 0) - (Math.random() * 6)}%,1)`;
			}
			let x = -Math.random() * 50;
			while (x < ctx.canvas.width) {
				const y = i * 100 + 100;
				const w = ((Math.random() * 50 + 50) * i + 10) * 5;
				const h = (Math.random() * 50 * i + 10 + w / 2) / 2;
				if (Math.random() < 0.2) {
					ctx.beginPath();
					ctx.moveTo(x, y);
					ctx.lineTo(x + w, y);
					ctx.lineTo(x + w / 2, y - h);
					ctx.fill();
				}
				x += w * Math.random();
			}
			i += 0.1;
		}
	}

	draw(ctx: CanvasRenderingContext2D, view: any): void {
		for (const entity of this.entities) {
			ctx.save();
			ctx.translate(entity.x, entity.y);
			const _save = ctx.save;
			const _restore = ctx.restore;
			let n_saved_states = 0;
			ctx.save = function(this: CanvasRenderingContext2D) {
				n_saved_states++;
				_save.apply(this, arguments as any);
			};
			ctx.restore = function(this: CanvasRenderingContext2D) {
				n_saved_states--;
				_restore.apply(this, arguments as any);
			};
			try {
				entity.draw(ctx, view, this);
			} catch (error) {
				console.error(`Error drawing entity ${entity.constructor.name} ${entity.id}:`, error);
				while (n_saved_states) {
					ctx.restore();
				}
			}
			ctx.save = _save;
			ctx.restore = _restore;
			ctx.restore();
		}
	}

	updateCollisionBuckets(): void {
		this.collision_buckets = {};
		for (const entity of [...this.entities, ...this.derived_colliders]) {
			if (entity.intangible) {
				continue;
			}
			let bbox: BBox;
			if (entity.structure.bbox_max) {
				const bbox_min_world = entity.toWorld(entity.structure.bbox_min);
				const bbox_max_world = entity.toWorld(entity.structure.bbox_max);
				bbox = {
					x: bbox_min_world.x,
					y: bbox_min_world.y,
					width: bbox_max_world.x - bbox_min_world.x,
					height: bbox_max_world.y - bbox_min_world.y
				};
			} else {
				bbox = entity.bbox();
			}
			const bx1 = Math.floor(bbox.x / bucket_width);
			const bx2 = Math.floor((bbox.x + bbox.width) / bucket_width);
			for (let bxi = bx1; bxi <= bx2; bxi++) {
				this.collision_buckets[bxi] = this.collision_buckets[bxi] || {};
				const by1 = Math.floor(bbox.y / bucket_height);
				const by2 = Math.floor((bbox.y + bbox.height) / bucket_height);
				for (let byi = by1; byi <= by2; byi++) {
					this.collision_buckets[bxi][byi] = this.collision_buckets[bxi][byi] || [];
					this.collision_buckets[bxi][byi].push(entity);
				}
			}
		}
	}

	drawCollisionBuckets(ctx: CanvasRenderingContext2D, view: any): void {
		ctx.lineWidth = 1 / view.scale;
		ctx.strokeStyle = "#FFFF00";
		ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
		for (const b_x in this.collision_buckets) {
			const bucket_column = this.collision_buckets[b_x];
			for (const b_y in bucket_column) {
				const entities = bucket_column[b_y];
				ctx.fillRect(Number(b_x) * bucket_width + 1 / view.scale, Number(b_y) * bucket_height + 1 / view.scale, bucket_width - 2 / view.scale, bucket_height - 2 / view.scale);
				for (const entity of entities) {
					const entity_bbox = entity.bbox();
					const entity_cx = entity_bbox.x + entity_bbox.width / 2;
					const entity_cy = entity_bbox.y + entity_bbox.height / 2;
					ctx.beginPath();
					ctx.moveTo(entity_cx, entity_cy);
					ctx.lineTo(Number(b_x) * bucket_width + bucket_width / 2, Number(b_y) * bucket_height + bucket_height / 2);
					ctx.stroke();
				}
			}
		}
	}

	drawCollisionHeatMap(ctx: CanvasRenderingContext2D, view: any): void {
		ctx.lineWidth = 1 / view.scale;
		ctx.strokeStyle = "#FF0000";
		if (!this.hit_test_counts) return;
		for (const b_x in this.hit_test_counts) {
			const bucket_column = this.hit_test_counts[b_x];
			for (const b_y in bucket_column) {
				const hit_test_count = bucket_column[b_y];
				if (hit_test_count > 0) {
					ctx.strokeRect(Number(b_x) * bucket_width, Number(b_y) * bucket_height, bucket_width, bucket_height);
					ctx.fillStyle = `rgba(255, 0, 0, ${hit_test_count / 100})`;
					ctx.fillRect(Number(b_x) * bucket_width + 1 / view.scale, Number(b_y) * bucket_height + 1 / view.scale, bucket_width - 2 / view.scale, bucket_height - 2 / view.scale);
				}
			}
		}
	}

	resetCollisionHeatMap(): void {
		this.hit_test_counts = {};
	}

	optimizeTerrain(): void {
		this.derived_colliders = [];
		const old_terrain_entities = this.getEntitiesOfType(Terrain);
		for (const old_terrain_entity of old_terrain_entities) {
			if (old_terrain_entity.intangible_because_optimized) {
				delete old_terrain_entity.intangible;
				delete old_terrain_entity.intangible_because_optimized;
			}
		}

		for (const old_terrain_entity of old_terrain_entities) {
			const min_points = 10;
			if (Object.keys(old_terrain_entity.structure.points).length < min_points) {
				continue;
			}

			const old_points = Object.values(old_terrain_entity.structure.points);
			const old_points_flat: number[] = [];
			for (const point of old_points as any[]) {
				old_points_flat.push(point.x, point.y);
			}
			const bbox_min_world = old_terrain_entity.toWorld(old_terrain_entity.structure.bbox_min);
			const bbox_max_world = old_terrain_entity.toWorld(old_terrain_entity.structure.bbox_max);
			const bucket_x_min = Math.floor(bbox_min_world.x / bucket_width);
			const bucket_x_max = Math.floor(bbox_max_world.x / bucket_width);
			let polygons: number[][] = [old_points_flat];
			for (let bucket_x = bucket_x_min; bucket_x <= bucket_x_max; bucket_x++) {
				let cut_x = bucket_x * bucket_width + bucket_width / 2 - old_terrain_entity.x;

				const epsilon = 0.0001;
				while (polygons.some((polygon_coords) =>
					polygon_coords.some((coord, i) =>
						i % 2 === 0 && Math.abs(coord - cut_x) < epsilon
					)
				)) {
					cut_x += epsilon;
				}
				try {
					polygons = polygons.flatMap((polygon) => PolyK.Slice(polygon, cut_x, -99999, cut_x, 99999));
				} catch (error) {
					console.warn("Error optimizing terrain:", error);
				}
			}

			if (polygons.length === 1) {
				continue;
			}

			old_terrain_entity.intangible = true;
			old_terrain_entity.intangible_because_optimized = true;

			for (const sliced_points_flat of polygons) {
				const sliced_points: Point[] = [];
				for (let i = 0; i < sliced_points_flat.length; i += 2) {
					sliced_points.push({ x: sliced_points_flat[i], y: sliced_points_flat[i + 1] });
				}
				const ent_def = Object.assign(JSON.parse(JSON.stringify(old_terrain_entity)), {
					structure: { points: sliced_points },
					intangible: false,
					intangible_because_optimized: false,
					entity_collider_is_derived_from: old_terrain_entity
				}) as any;
				// @ts-ignore - delete is safe here since we control the serialization
				delete ent_def.id;
				const new_terrain_entity = EntityClass.fromJSON(ent_def);
				this.derived_colliders.push(new_terrain_entity);
			}
		}
	}

	collision(point: Point, { types = [Terrain], lineThickness = 5 }: CollisionOptions = {}): any | null {
		if (!this.collision_buckets) {
			console.warn("Collision detection called before collision buckets were initialized.");
			this.updateCollisionBuckets();
		}

		const b_x = Math.floor(point.x / bucket_width);
		const b_y = Math.floor(point.y / bucket_height);
		const entities = (this.collision_buckets![b_x] || {})[b_y] || [];

		if (count_hit_tests) {
			this.hit_test_counts = this.hit_test_counts || {};
			this.hit_test_counts[b_x] = this.hit_test_counts[b_x] || {};
			this.hit_test_counts[b_x][b_y] = this.hit_test_counts[b_x][b_y] || 0;
			this.hit_test_counts[b_x][b_y]++;
		}

		for (const entity of entities) {
			if (typeof types === "function") {
				if (!types(entity)) {
					continue;
				}
			} else {
				let match = false;
				for (const type of types) {
					if ((entity instanceof type) && (entity.solid ?? true)) {
						match = true;
						break;
					}
				}
				if (!match) {
					continue;
				}
			}
			const local_point = entity.fromWorld(point);
			if (entity.structure.pointInPolygon) {
				if (entity.structure.pointInPolygon(local_point)) {
					if (entity.entity_collider_is_derived_from) {
						return entity.entity_collider_is_derived_from;
					}
					return entity;
				}
			} else {
				for (const segment_name in entity.structure.segments) {
					const segment = entity.structure.segments[segment_name];
					const dist = distanceToLineSegmentHelper(local_point, segment.a, segment.b);
					if (dist < lineThickness) {
						return entity;
					}
				}
			}
		}
		return null;
	}

	closest = (point_in_world_space: Point, EntityClass: any, filter?: (entity: any) => boolean): ClosestResult => {
		let closest_dist = Infinity;
		let closest_entity: any | null = null;
		let closest_segment: any | null = null;
		for (const entity of this.getEntitiesOfType(EntityClass)) {
			if (filter && !filter(entity)) {
				continue;
			}
			const point_in_entity_space = entity.fromWorld(point_in_world_space);
			for (const segment_name in entity.structure.segments) {
				const segment = entity.structure.segments[segment_name];
				const dist = distanceToLineSegmentHelper(point_in_entity_space, segment.a, segment.b);
				if (dist < closest_dist) {
					closest_dist = dist;
					closest_entity = entity;
					closest_segment = segment;
				}
			}
		}
		return { closest_entity, closest_dist, closest_segment };
	};

	projectPointOutside(point_in_world_space: Point, { types = [Terrain], outsideEntity }: ProjectOptions = {}): ProjectResult | null {
		let closest_distance = Infinity;
		let closest_segment: any | null = null;
		const hit = outsideEntity ?? this.collision(point_in_world_space, { types });
		if (!hit) {
			return null;
		}
		const point_in_hit_space = hit.fromWorld(point_in_world_space);
		for (const segment_name in hit.structure.segments) {
			const segment = hit.structure.segments[segment_name];
			const dist = distanceToLineSegmentHelper(point_in_hit_space, segment.a, segment.b);
			if (dist < closest_distance && Math.hypot(segment.a.x - segment.b.x, segment.a.y - segment.b.y) > 0.1) {
				closest_distance = dist;
				closest_segment = segment;
			}
		}
		if (closest_segment) {
			const closest_point_in_hit_space = worldClosestPointOnLineSegment(point_in_hit_space, closest_segment.a, closest_segment.b);
			const closest_point_in_world = hit.toWorld(closest_point_in_hit_space);
			return { closest_point_in_world, closest_point_in_hit_space, closest_segment };
		}
		return null;
	}
}

module.exports = World;
