// Can it walk and/or run and/or jump, and not much else? It might be a SimpleActor.
// SimpleActors have rectangular collision boxes and basic physics.

const { Terrain: SimpleActorTerrain } = require("skele2d");
const { lineSegmentsIntersect } = require("skele2d").helpers;
const Entity = require("./Entity.coffee");

interface Point {
	x: number;
	y: number;
}

interface Segment {
	a: Point;
	b: Point;
}

interface World {
	entities: any[];
	collision: (params: any, options?: any) => any;
}

class SimpleActor extends Entity {
	static gravity = 0.5;
	
	vx: number;
	vy: number;
	width: number;
	height: number;
	jump_height: number;
	walk_speed: number;
	run_speed: number;
	move_x: number;
	move_y: number;
	jump: boolean;
	grounded: boolean;
	facing_x: number;
	submerged: any;
	landing_momentum: number = 0;

	constructor() {
		super();
		this.vx = 0;
		this.vy = 0;
		this.width = 10;
		this.height = 40;
		this.jump_height = 50;
		this.walk_speed = 4;
		this.run_speed = 6;
		this.move_x = 0;
		this.move_y = 0;
		this.jump = false;
		this.grounded = false;
		this.facing_x = 0;
	}

	find_ground_angle(world: World): number | void {
		const a: Point = { x: this.x, y: this.y };
		const b: Point = { x: this.x, y: this.y + 2 + this.height }; // slightly further down than collision code uses
		for (const entity of world.entities) {
			if (entity instanceof SimpleActorTerrain) {
				if (entity.structure.pointInPolygon(entity.fromWorld(b))) {
					// console.log "found ground"
					// find line segment intersecting ab
					const e_a = entity.fromWorld(a);
					const e_b = entity.fromWorld(b);
					for (const segment_name in entity.structure.segments) {
						const segment: Segment = entity.structure.segments[segment_name];
						if (lineSegmentsIntersect(e_a.x, e_a.y, e_b.x, e_b.y, segment.a.x, segment.a.y, segment.b.x, segment.b.y)) {
							// find the angle
							let angle = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x);
							// console.log "angle", angle
							if (Math.cos(angle) < 0) {
								angle -= Math.PI;
								angle = (angle + Math.PI * 2) % (Math.PI * 2);
							}
							return angle;
						}
					}
				}
			}
		}
		// console.log "no ground found"
	}

	step(world: World): void {
		if (this.y > 400) return;

		const gravity = SimpleActor.gravity;

		// TODO: Boolean, not for @submerged though; that I could rename @water or something
		this.grounded = world.collision({ x: this.x, y: this.y + 1 + this.height }); //or world.collision({x: this.x, y: this.y + this.vy + this.height}) or world.collision({x: this.x, y: this.y + 4 + this.height})
		this.submerged = world.collision({ x: this.x, y: this.y + this.height * 0.9 }, {
			types: (entity: any) => {
				return entity.constructor.name === "Water";
			}
		});
		const more_submerged = this.submerged && world.collision({ x: this.x, y: this.y + this.height * 0.4 }, {
			types: (entity: any) => {
				return entity.constructor.name === "Water";
			}
		});

		if (this.grounded) {
			// if (Math.abs(this.vx) >= 1) {
			// 	this.vx -= Math.sign(this.vx);
			// } else {
			// 	this.vx = 0;
			// }
			// this.vx += this.move_x;
			if (this.move_x === 0) {
				this.vx *= 0.7;
			} else {
				this.vx += this.move_x;
			}
			if (this.jump) {
				this.vy = -Math.sqrt(2 * gravity * this.jump_height);
			}
		} else {
			this.vx += this.move_x * 0.7;
		}
		this.vx = Math.min(this.run_speed, Math.max(-this.run_speed, this.vx));
		this.vy += gravity;
		if (this.submerged) {
			if (more_submerged || this.move_y > 0) {
				this.vy += this.move_y * 0.7;
			}
			this.vy *= 0.8;
			this.vx *= 0.8;
			if (!more_submerged) {
				this.submerged.makeWaves({ x: this.x, y: this.y + this.height * 0.9 }, this.width / 2, this.vy);
			}
		}

		// this.vy *= 0.99;
		let move_x = this.vx;
		let move_y = this.vy;
		// checking this.vy and not just not this.jump because Rabbit currently uses this.vy to jump
		if (this.grounded && this.vy >= 0) {
			// follow hills downward
			// This prevents awkward situations where you can't jump
			// because you just left the ground (by running forwards)
			move_y += Math.abs(this.vx);
		}
		if (move_x !== 0) {
			this.facing_x = Math.sign(move_x);
		}
		const resolution = 0.5;
		while (Math.abs(move_x) > resolution) {
			const go = Math.sign(move_x) * resolution;
			if (world.collision({ x: this.x + go, y: this.y + this.height })) {
				this.vx *= 0.99;
				// TODO: clamber over tiny divots and maybe even stones and twigs
				// This only handles going at a 45 degree angle,
				// but stops on tiny 2-unit-high obstacles if it's > 45 degrees
				if (world.collision({ x: this.x + go, y: this.y + this.height - 1 })) {
					break;
				} else {
					this.y -= 1;
					if (this.vy > 0) {
						this.vy = 0;
					}
				}
			}
			move_x -= go;
			this.x += go;
		}
		if (Math.abs(move_y) > resolution) {
			this.grounded = false;
		}
		while (Math.abs(move_y) > resolution) {
			const go = Math.sign(move_y) * resolution;
			if (world.collision({ x: this.x, y: this.y + go + this.height })) {
				if (this.constructor.name === "Player") {
					// 1 is the granularity of the stepping code here.
					// If gravity is 0.5, vy may accumulate to 1 before moving,
					// so we can't use gravity as the threshold.
					if (this.vy > 1) {
						this.landing_momentum = Math.max(this.landing_momentum, this.vy);
						// console.log "landing_momentum", this.landing_momentum, "vy", this.vy
					}
				}
				this.vy = 0;
				this.grounded = true;
				break;
			}
			move_y -= go;
			this.y += go;
		}
		// this.jump_height = this.y - view.toWorld(editor.mouse).y;

		// if (this.jump) {
		// 	for (let i = 0; i <= 5; i++) {
		// 		console.log(world.collision({x: this.x, y: this.y + i + this.height}));
		// 	}
		// 	console.log(this.vy, world.collision({x: this.x, y: this.y + this.vy + this.height}));
		// }

		// console.log "RES", world.collision({x: this.x, y: this.y + resolution + this.height})

		// this.grounded = world.collision({x: this.x, y: this.y + 1 + this.height}); //or world.collision({x: this.x, y: this.y + this.vy + this.height}) or world.collision({x: this.x, y: this.y + 4 + this.height})
		// 
		// if (this.grounded && this.jump) {
		// 	this.vy = -Math.sqrt(2 * gravity * this.jump_height);
		// }

		return;
	}
}

module.exports = SimpleActor;
