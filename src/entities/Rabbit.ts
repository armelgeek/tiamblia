const RabbitSimpleActor = require("./abstract/SimpleActor");
const { addEntityClass: addRabbitEntityClass } = require("skele2d");

const TAU_RABBIT = Math.PI * 2;
const r_rabbit = (): number => Math.random() * 2 - 1;

interface World {
	collision: (params: any, options?: any) => any;
}

class Rabbit extends RabbitSimpleActor {
	width: number;
	height: number;
	xp: number;
	t: number;
	lr: number;
	dir: number;
	body_color: string;
	body_shadow_color: string;
	eye_color: string;
	alive: boolean;
	smoothed_facing_x: number;

	constructor() {
		super();
		this.structure.addPoint("head");
		this.structure.addSegment({
			from: "head",
			name: "body",
			length: 5
		});
		this.bbox_padding = 20;

		this.width = 8;
		this.height = 8;
		this.xp = 0;
		this.t = 0;
		this.lr = 0;
		this.dir = 0;
		this.body_color = "#FFF";
		this.body_shadow_color = "#DDD";
		this.eye_color = "#000";
		this.alive = true;
		this.smoothed_facing_x = this.facing_x = 1;
	}

	step(world: World): void {
		if (!this.alive) {
			return;
		}

		if (this.grounded) {
			// @vx*=0.99
			if (Math.random() < 0.1) {
				this.dir = r_rabbit();
			}
			if (Math.random() < 0.1) {
				this.vy = -5;
			} else if (Math.abs(this.vx) > 1) {
				this.vy = -3;
			}
		} else {
			if (Math.abs(this.xp - this.x) < 1) {
				this.t++;
				if (this.t > 15) {
					this.dir = r_rabbit();
				}
			} else {
				this.t = 0;
			}
		}

		this.vx += (this.dir *= 1.1) / 15;
		this.dir = Math.max(-10, Math.min(10, this.dir));
		if (Math.abs(this.vx) < 0.1) {
			this.dir = 0;
		}
		this.xp = this.x;

		this.move_x = this.dir * 0.02;
		this.move_y = -1;
		// run SimpleActor physics, which uses @move_x and @jump
		super.step(world);

		this.smoothed_facing_x += (this.facing_x - this.smoothed_facing_x) / 5;

		this.stepLayout();
	}

	initLayout(): void {
		this.stepLayout();
	}

	stepLayout(): void {
		// Align skeleton to the body
		this.structure.points.head.x = this.width / 2 + this.facing_x * this.width / 2;
		this.structure.points.head.y = this.height * 0.5;
		this.structure.points.body.x = this.width / 2 - this.facing_x * this.width / 2;
		this.structure.points.body.y = this.height;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.save(); // body transform
		// ctx.translate(@width/2,@height)
		ctx.translate(0, this.height);

		// for cute hopping, rotate based on the angle of movement
		if (this.vx !== 0) {
			let angle = Math.atan2(this.vy, Math.abs(this.vx));
			// Reduce the angle if it's too big, in a soft way
			if (Math.abs(angle) > 1) {
				angle = Math.pow(Math.abs(angle), 0.5) * Math.sign(angle);
			}
			ctx.rotate(angle / 2);
		}

		ctx.beginPath();
		ctx.fillStyle = this.body_color;
		ctx.arc(-this.smoothed_facing_x * this.width / 2, 0, this.height / 5, 0, TAU_RABBIT, false); // tail
		ctx.fill();
		ctx.beginPath();
		ctx.fillStyle = this.body_shadow_color;
		ctx.arc(0, 0, this.height / 2, TAU_RABBIT * 0.45, TAU_RABBIT * 1.05, false); // body
		ctx.fill();
		ctx.fillStyle = this.body_color;
		ctx.save(); // head transform
		ctx.translate(this.smoothed_facing_x * this.width / 3, -this.height / 3);
		ctx.beginPath();
		const head_radius = this.height / 3;
		const draw_head_arc = () => {
			ctx.arc(0, 0, head_radius, TAU_RABBIT * 0.45, TAU_RABBIT * 1.05, false);
		};
		draw_head_arc();
		ctx.fill(); // head
		// ctx.rotate(Math.sin(performance.now()/1000))
		const turn_limit = TAU_RABBIT / 5; // radians, TAU_RABBIT/4 = head facing completely sideways, only one eye visible
		const ear_spacing = TAU_RABBIT / 12; // radians
		const ear_rotation_radius = head_radius * 0.8;
		for (const ear_signature of [-1, 1]) {
			ctx.save(); // ear transform
			ctx.beginPath();
			const head_rotation_angle = this.smoothed_facing_x * turn_limit * -1;
			const ear_x = Math.sin(ear_spacing * ear_signature - head_rotation_angle) * ear_rotation_radius * -1;
			ctx.translate(ear_x, -this.height / 6);
			ctx.rotate(-Math.min(TAU_RABBIT / 6, Math.max(-TAU_RABBIT / 6, this.vx / 3 + ear_signature * TAU_RABBIT / 20)));
			ctx.scale(1, 3);
			ctx.arc(0, -this.height / 9, 1, 0, TAU_RABBIT, false); // ear
			ctx.fill();
			ctx.restore(); // end ear transform
		}
		ctx.save(); // head clip
		ctx.beginPath();
		draw_head_arc();
		ctx.clip();
		ctx.beginPath();
		const eye_radius = 1;
		const eye_y = -1;
		const eye_spacing = 1; // radians
		ctx.fillStyle = this.eye_color;
		for (const eye_signature of [-1, 1]) {
			// 3D projection in one axis
			const head_rotation_angle = this.smoothed_facing_x * turn_limit * -1;
			let eye_x = Math.sin(eye_spacing * eye_signature - head_rotation_angle) * head_radius;
			const back_of_head = Math.cos(eye_spacing * eye_signature - head_rotation_angle) < 0;
			// continue if back_of_head # don't draw eyes on the back of the head
			if (back_of_head) {
				// non-physical kludge to make the eyes transition away when going behind the head
				eye_x += Math.cos(eye_spacing * eye_signature - head_rotation_angle) * head_radius * eye_signature * -1;
			}
			ctx.beginPath();
			ctx.arc(eye_x, eye_y, eye_radius, 0, TAU_RABBIT);
			ctx.fill();
		}
		ctx.beginPath();
		ctx.restore(); // end head clip
		ctx.fill();
		ctx.fillStyle = this.body_color;
		ctx.beginPath();
		ctx.restore(); // end head transform
		ctx.restore(); // end body transform
	}
}

addRabbitEntityClass(Rabbit);
module.exports = Rabbit;
