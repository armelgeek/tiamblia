const ArrowTestArcheryTarget = require("./entities/items/ArcheryTarget.coffee");
const ArrowTestArrow = require("./entities/items/Arrow.coffee");

// Note: It helps to disable gravity for this test for symmetry,
// and to disable some conditions on lodging and enable visualization of the lodging constraints.

let off_angle = 0;

const enable_arrow_test_scene = (): void => {
	addEventListener("mousemove", (e: MouseEvent) => {
		off_angle = Math.atan2(e.clientY - innerHeight / 2, e.clientX - innerWidth / 2);
		return;
	});

	addEventListener("mousedown", (e: MouseEvent) => {
		if (e.button === 1) { // middle click
			(window as any).create_arrow_test_scene();
		}
		return;
	});

	(window as any).create_arrow_test_scene();
	// setTimeout(window.create_arrow_test_scene, 1000);
	return;
};

const create_arrow_test_scene = (): void => {
	const world = (window as any).the_world;

	world.entities.length = 0;

	const arrows: any[] = [];
	for (let target_angle = -Math.PI; target_angle <= Math.PI; target_angle += Math.PI / 8) {
		const target = new ArrowTestArcheryTarget();
		target.x = 200 * Math.cos(target_angle);
		target.y = 200 * Math.sin(target_angle);
		target.structure.points.a.x = -100 * Math.cos(target_angle);
		target.structure.points.a.y = -100 * Math.sin(target_angle);
		target.structure.points.b.x = 100 * Math.cos(target_angle);
		target.structure.points.b.y = 100 * Math.sin(target_angle);
		world.entities.push(target);

		// Create arrows shooting at the target from various angles
		for (let arrow_angle = -Math.PI; arrow_angle <= Math.PI; arrow_angle += Math.PI / 16) {
			const arrow = new ArrowTestArrow();
			arrow.x = target.x - 50 * Math.cos(arrow_angle);
			arrow.y = target.y - 50 * Math.sin(arrow_angle);
			arrow.structure.points.nock.x = -10 * Math.cos(arrow_angle + off_angle);
			arrow.structure.points.nock.y = -10 * Math.sin(arrow_angle + off_angle);
			arrow.structure.points.tip.x = 10 * Math.cos(arrow_angle + off_angle);
			arrow.structure.points.tip.y = 10 * Math.sin(arrow_angle + off_angle);
			arrow.setVelocity(
				5 * Math.cos(arrow_angle),
				5 * Math.sin(arrow_angle)
			);
			arrows.push(arrow);
		}
	}

	world.entities.push(...arrows);
	return;
};

interface CreateArrowVolleyOptions {
	x?: number;
	y?: number;
	angle_min?: number;
	angle_max?: number;
	speed_min?: number;
	speed_max?: number;
	count?: number;
}

(window as any).create_arrow_volley = ({
	x = 0,
	y = 0,
	angle_min = -Math.PI * 3 / 4,
	angle_max = -Math.PI / 4,
	speed_min = 5,
	speed_max = 20,
	count = 100
}: CreateArrowVolleyOptions = {}): void => {
	const world = (window as any).the_world;
	const arrows: any[] = [];
	for (let i = 0; i < count; i++) {
		const arrow = new ArrowTestArrow();
		arrow.x = x;
		arrow.y = y;
		const arrow_angle = Math.random() * (angle_max - angle_min) + angle_min;
		const arrow_speed = Math.random() * (speed_max - speed_min) + speed_min;
		arrow.structure.points.nock.x = -10 * Math.cos(arrow_angle);
		arrow.structure.points.nock.y = -10 * Math.sin(arrow_angle);
		arrow.structure.points.tip.x = 10 * Math.cos(arrow_angle);
		arrow.structure.points.tip.y = 10 * Math.sin(arrow_angle);
		arrow.setVelocity(
			arrow_speed * Math.cos(arrow_angle),
			arrow_speed * Math.sin(arrow_angle)
		);
		arrows.push(arrow);
	}
	world.entities.push(...arrows);
	return;
};

(window as any).enable_arrow_test_scene = enable_arrow_test_scene;
(window as any).create_arrow_test_scene = create_arrow_test_scene;

module.exports = enable_arrow_test_scene;
