const BirdSimpleActor = require("./abstract/SimpleActor.ts");
const { addEntityClass: addBirdEntityClass } = require("skele2d");

const r_bird = (): number => Math.random() * 2 - 1;

interface World {
	collision: (params: any, options?: any) => any;
}

class Bird extends BirdSimpleActor {
	width: number;
	height: number;
	flap: number;
	flap_timer: number;
	wingspan: number;
	go_x: number;
	go_y: number;

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
		this.flap = 0;
		this.flap_timer = r_bird() * 15;
		this.wingspan = 10;
		this.go_x = r_bird() * 5;
		this.go_y = 0;
	}

	step(world: World): void {
		for (let i = 0; i <= 50; i++) {
			const x = r_bird() * 50;
			const y = r_bird() * 70;
			if (world.collision({ x: this.x + x, y: this.y + y })) {
				this.go_y -= y / 30;
				this.go_x -= x / (10 + Math.abs(this.go_y));
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

		this.go_x *= 0.95;
		this.go_y *= 0.7;
		this.vx += (this.go_x - this.vx) / 2;
		this.vy += 0.1;
		this.x += this.vx;
		this.y += this.vy;
		this.flap_timer--;
		// run SimpleActor physics, which uses @move_x and @jump
		// super(world)
		// This was in draw() before, and it looks kinda confusing...
		if (this.flap_timer < 0) {
			this.flap_timer = -1;
		}
		this.flap += this.flap_timer / 20;
		this.flap += (-this.flap - 0.1) * 0.1;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		ctx.strokeStyle = "#000";
		ctx.beginPath();
		const f = 2.8;
		ctx.moveTo(0, 0);
		ctx.lineTo(0 + Math.cos(this.flap - f) * this.wingspan, 0 + Math.sin(this.flap - f) * this.wingspan);
		ctx.moveTo(0, 0);
		ctx.lineTo(0 - Math.cos(this.flap - f) * this.wingspan, 0 + Math.sin(this.flap - f) * this.wingspan);
		ctx.stroke();
	}
}

addBirdEntityClass(Bird);
module.exports = Bird;
