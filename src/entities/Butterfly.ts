const ButterflySimpleActor = require("./abstract/SimpleActor.ts");
const { addEntityClass: addButterflyEntityClass } = require("skele2d");
const hsl_to_rgb_hex_butterfly = require("../hsl-to-rgb-hex.js");

const r_butterfly = (): number => Math.random() * 2 - 1;

interface World {
	collision: (params: any, options?: any) => any;
}

class Butterfly extends ButterflySimpleActor {
	width: number;
	height: number;
	go_x: number;
	go_y: number;
	t: number;
	flap: number;
	flap_timer: number;
	color_1: string;
	color_2: string;

	constructor() {
		super();
		this.structure.addPoint("head");
		this.structure.addSegment({
			from: "head",
			name: "body",
			length: 5
		});
		this.bbox_padding = 20;

		this.width = 4;
		this.height = 4;
		this.go_x = r_butterfly() * 5;
		this.go_y = r_butterfly() * 5;
		this.t = r_butterfly() * 5;
		this.flap = r_butterfly() * 5;
		this.flap_timer = r_butterfly() * 15;
		// hex is for lil-gui based entity properties editor
		this.color_1 = hsl_to_rgb_hex_butterfly("hsla(" + (Math.random() * 360) + ",100%," + (50 + Math.random() * 50) + "%,1)");
		this.color_2 = hsl_to_rgb_hex_butterfly("hsla(" + (Math.random() * 360) + ",100%," + (50 + Math.random() * 50) + "%,1)");
	}

	step(world: World): void {
		for (let i = 0; i <= 50; i++) {
			const x = r_butterfly() * 50;
			const y = r_butterfly() * 70;
			if (world.collision({ x: this.x + x, y: this.y + y })) {
				this.go_y -= y / 50;
				this.go_x -= x / (50 + Math.abs(this.go_y));
			}
		}
		if (this.flap_timer < 0) {
			if (this.go_y < -1) {
				this.vy -= 5;
				this.flap_timer = 15;
			} else {
				this.vy -= 1;
				this.flap_timer = 15;
			}
		}

		this.go_x *= 0.9;
		this.go_y *= 0.9;
		this.go_x += r_butterfly() / 2;
		this.go_y += r_butterfly() / 2;
		this.vx += (this.go_x - this.vx / 2) / 3;
		this.vy += (this.go_y - this.vy / 2) / 3;
		this.vy += 0.01;
		this.x += this.vx;
		this.y += this.vy;
		this.flap = Math.cos(this.t += 0.5);
		// run SimpleActor physics, which uses @move_x and @jump
		// super(world)
		// This was in draw() before, and it looks confusing, together with @flap=... above
		if (this.flap_timer < 0) {
			this.flap_timer = -1;
		}
		this.flap += this.flap_timer / 20;
		this.flap += (-this.flap - 0.1) * 0.1;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.beginPath();
		const f = 2.8;

		ctx.strokeStyle = this.color_1;
		ctx.moveTo(0, 0);
		ctx.lineTo(0 + Math.cos(this.flap - f) * this.width, 0 + Math.sin(this.flap - f) * this.width);
		ctx.moveTo(0, 0);
		ctx.lineTo(0 - Math.cos(this.flap - f) * this.width, 0 + Math.sin(this.flap - f) * this.width);
		ctx.stroke();
		ctx.beginPath();

		ctx.strokeStyle = this.color_2;
		ctx.moveTo(0, 0);
		ctx.lineTo(0 + Math.cos(this.flap + f) * this.width, 0 + Math.sin(this.flap + f) * this.width);
		ctx.moveTo(0, 0);
		ctx.lineTo(0 - Math.cos(this.flap + f) * this.width, 0 + Math.sin(this.flap + f) * this.width);
		ctx.stroke();
		ctx.beginPath();
	}
}

addButterflyEntityClass(Butterfly);
module.exports = Butterfly;
