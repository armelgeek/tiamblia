const FrogSimpleActor = require("./abstract/SimpleActor.ts");
const { addEntityClass: addFrogEntityClass } = require("skele2d");
const hsl_to_rgb_hex_frog = require("../hsl-to-rgb-hex.js");

const TAU_FROG = Math.PI * 2;
const r_frog = (): number => Math.random() * 2 - 1;

interface World {
	collision: (params: any, options?: any) => any;
}

class Frog extends FrogSimpleActor {
	width: number;
	height: number;
	xp: number;
	t: number;
	lr: number;
	dir: number;
	body_color: string;

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
		// hex is for lil-gui based entity properties editor
		this.body_color = hsl_to_rgb_hex_frog("hsla(" + (150 - Math.random() * 50) + "," + (50 + Math.random() * 50) + "%," + (50 - Math.random() * 20) + "%,1)");
	}

	step(world: World): void {
		if (this.grounded) {
			this.vx *= 0.1;
			if (Math.random() > 0.1) {
				// jump
				this.vy = Math.random() * -5;
				this.dir = r_frog();
				this.t = 0;
			}
		} else {
			this.vx += this.dir *= 2;
			if (this.xp === this.x) {
				this.t++;
				if (this.t > 5) {
					this.dir = r_frog();
				}
			} else {
				this.t = 0;
			}
		}

		this.xp = this.x;

		this.move_x = this.dir * 0.2;
		this.move_y = 0;
		// run SimpleActor physics, which uses @move_x and @jump
		super.step(world);
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.save();
		ctx.rotate(this.vx / 5);
		ctx.fillStyle = this.body_color;
		//ctx.fillRect(@x,@y,@width,@height)
		ctx.beginPath();
		ctx.arc(this.width / 2, this.height / 4 - this.vy, this.height / 2, 0, TAU_FROG / 2, false);
		ctx.arc(this.width / 2, this.height, this.height / 2, TAU_FROG / 2, TAU_FROG, false);
		ctx.fill();
		ctx.restore();
	}
}

addFrogEntityClass(Frog);
module.exports = Frog;
