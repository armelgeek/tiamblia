const DeerSimpleActor = require("./abstract/SimpleActor");
const DeerEntity = require("./abstract/Entity.coffee");
const { addEntityClass: addDeerEntityClass } = require("skele2d");
const hsl_to_rgb_hex_deer = require("../hsl-to-rgb-hex");

const TAU_DEER = Math.PI * 2;
const r_deer = (): number => Math.random() * 2 - 1;

interface World {
	collision: (params: any, options?: any) => any;
}

class Deer extends DeerSimpleActor {
	width: number;
	height: number;
	x_prev: number;
	linger_time: number;
	leg_rotation: number;
	smoothed_facing_x: number;
	rideable: boolean;
	body_color: string;
	ground_angle: number;
	ground_angle_smoothed: number;

	constructor() {
		super();
		this.structure.addPoint("head");
		this.structure.addSegment({
			from: "head",
			name: "neck",
			length: 5
		});
		this.bbox_padding = 30;

		this.width = 27;
		this.height = 18;
		this.x_prev = 0; // previous x position
		this.linger_time = 0; // I guess this was trying to
		// avoid getting stuck for too long on a cliff, a hill too steep to climb.
		// I don't know if it works with the new game, after porting from tiamblia-original.
		this.leg_rotation = 0; // leg rotation
		this.smoothed_facing_x = this.facing_x = 1;
		this.rideable = true;
		// hex is for lil-gui based entity properties editor
		this.body_color = hsl_to_rgb_hex_deer("hsla(" + (Math.random() * 20) + "," + (10) + "%," + (50 + Math.random() * 20) + "%,1)");
		this.ground_angle = 0;
		this.ground_angle_smoothed = 0;
		// smoothed_facing_x and ground_angle_smoothed, huh? inconsistent naming scheme
	}

	step(world: World): void {
		if (this.grounded) {
			// Note: ground_angle  and ground_angle_smoothed are used by Player while riding
			const found_angle = this.find_ground_angle(world);
			this.ground_angle = found_angle != null ? found_angle : 0;
			this.ground_angle = Math.atan2(Math.sin(this.ground_angle), Math.cos(this.ground_angle));
			this.ground_angle_smoothed += (this.ground_angle - this.ground_angle_smoothed) / 5;
			if (Math.random() < 0.01) {
				this.move_x = r_deer();
				if (Math.abs(this.move_x) < 0.3) {
					this.move_x = 0;
				}
			}
		} else {
			this.ground_angle = 0;
			this.ground_angle_smoothed += (this.ground_angle - this.ground_angle_smoothed) / 10;
			if (Math.abs(this.x_prev - this.x) < 1) {
				this.linger_time++;
				if (this.linger_time > 15) {
					this.move_x = r_deer();
					if (Math.abs(this.move_x) < 0.3) {
						this.move_x = 0;
					}
					this.linger_time = 0;
				}
			} else {
				this.linger_time = 0;
			}
		}

		this.leg_rotation += Math.abs(this.vx) / 5;
		this.x_prev = this.x;

		// swim upwards always if in water
		this.move_y = -1;
		// run SimpleActor physics, which uses @move_x/y and @jump
		super.step(world);

		this.smoothed_facing_x += (this.facing_x - this.smoothed_facing_x) / 10;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.save();
		// ctx.translate(@x,@y+@height*3/4)
		ctx.translate(0, this.height * 3 / 4);
		ctx.rotate(this.ground_angle_smoothed);

		ctx.beginPath();
		ctx.fillStyle = this.body_color;
		ctx.arc(0, -this.height / 2, this.height / 3, 0, TAU_DEER, true);
		ctx.fill();

		ctx.scale(this.smoothed_facing_x, 1);
		// ctx.rotate(@vx/-10)
		// legs
		ctx.strokeStyle = "#a55";
		ctx.beginPath();
		ctx.moveTo(-this.width / 2, -this.height / 2);
		ctx.lineTo(Math.cos(this.leg_rotation) * 10 - this.width / 2, this.height / 2 + Math.sin(this.leg_rotation) * 8);
		ctx.moveTo(-this.width / 2, -this.height / 2);
		ctx.lineTo(Math.cos(this.leg_rotation + TAU_DEER / 2) * 10 - this.width / 2, this.height / 2 + Math.sin(this.leg_rotation + TAU_DEER / 2) * 8);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(this.width / 2, -this.height / 2);
		ctx.lineTo(Math.cos(this.leg_rotation + 0.1) * 10 + this.width / 2, this.height / 2 + Math.sin(this.leg_rotation) * 8);
		ctx.moveTo(this.width / 2, -this.height / 2);
		ctx.lineTo(Math.cos(this.leg_rotation + TAU_DEER / 2 + 0.2) * 10 + this.width / 2, this.height / 2 + Math.sin(this.leg_rotation + TAU_DEER / 2) * 8);
		ctx.stroke();

		ctx.fillStyle = this.body_color;
		ctx.save(); // head
		ctx.translate(this.width / 2, this.height * -3 / 4);
		ctx.rotate(-0.4 + Math.cos(this.x / 50));
		ctx.fillRect(-5, -5, 15, 8);
		ctx.translate(12, 0);
		ctx.rotate(0.6 - Math.cos(this.x / 50) / 2);
		// ctx.fillRect(-5,-5,15,8)
		ctx.beginPath();
		ctx.moveTo(-5, -5);
		ctx.lineTo(-5, 3);
		ctx.lineTo(10, 1);
		ctx.lineTo(10, -2);
		ctx.fill();
		// eye
		ctx.fillStyle = "#000";
		ctx.beginPath();
		ctx.arc(0, 0, 1, 0, TAU_DEER, true);
		ctx.fill();
		ctx.restore(); // /head

		// body
		ctx.fillRect(this.width / -2, this.height / -1, this.width, this.height * 3 / 4);

		ctx.restore();
	}
}

addDeerEntityClass(Deer);
module.exports = Deer;
