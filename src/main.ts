// @ts-ignore
Math.seedrandom("A world");

const { View, Mouse, Editor, Entity, Terrain } = require("skele2d");
const Stats = require("stats.js");
const { gui, update_property_inspector, configure_property_inspector } = require("./dev-ui.ts");
const World = require("./World.ts");
const keyboard = require("./keyboard.ts");
const sort_entities = require("./sort-entities.ts");
const randomize_entities = require("./randomize-entities.ts");
require("./arrow-test.ts");

// require each entity to add it to the entity registry
require("./entities/GeneticPlant.ts");
require("./entities/CactusTree.ts");
require("./entities/Caterpillar.ts");
const SavannaGrass = require("./entities/terrain/SavannaGrass.ts");
require("./entities/terrain/LushGrass.ts");
require("./entities/terrain/Rock.ts");
require("./entities/terrain/Water.ts");
require("./entities/PuffTree.ts");
require("./entities/SavannaTreeA.ts");
require("./entities/Cloud.ts");
require("./entities/Butterfly.ts");
require("./entities/Bird.ts");
require("./entities/Frog.ts");
require("./entities/Rabbit.ts");
require("./entities/Deer.ts");
require("./entities/GranddaddyLonglegs.ts");
const Player = require("./entities/Player.ts");
require("./entities/items/Bow.ts");
require("./entities/items/Arrow.ts");
require("./entities/items/ArcheryTarget.ts");

const TAU = Math.PI * 2;

// Hack Terrain serialization to skip intangibility from terrain optimization
// TODO: Skele2D shouldn't own Terrain class
const old_terrain_toJSON = Terrain.prototype.toJSON;
Terrain.prototype.toJSON = function(this: any) {
	const def = old_terrain_toJSON.call(this);
	if (def.intangible_because_optimized) {
		delete def.intangible_because_optimized;
		delete def.intangible;
	}
	return def;
};

const world = new World();

const terrain = new SavannaGrass();
world.entities.push(terrain);
terrain.x = 0;
terrain.y = 0;
terrain.generate();

const bottom_of_world = terrain.toWorld(terrain.structure.bbox_max).y;

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

const view = new View();
const view_to = new View();
const view_smoothness = 7;
const mouse = new Mouse(canvas);

const editor = new Editor(world, view, view_to, canvas, mouse);

configure_property_inspector({ editor, world });

const welcome = document.getElementById("welcome");
let disable_welcome_message: boolean;
try {
	disable_welcome_message = localStorage["tiamblia.disable_welcome_message"] === "true";
} catch (e) {
	disable_welcome_message = false;
}

let world_loaded = false;

if (disable_welcome_message) {
	welcome?.remove();
} else {
	// hacky way to make it play by default instead of edit
	// but not mess up the editor's undo state that it creates when you start playing
	const _fromJSON = world.fromJSON;
	world.fromJSON = function(json: any) {
		_fromJSON.call(world, json);
		if (editor.editing) {
			editor.toggleEditing();
		}
		world.fromJSON = _fromJSON;
		world_loaded = true;
		return;
	};
}

try {
	editor.load();
} catch (e) {
	if (console?.error) {
		console.error("Failed to load save:", e);
	}
}

try {
	if (!isNaN(parseFloat(localStorage.view_center_x))) {
		view_to.center_x = view.center_x = parseFloat(localStorage.view_center_x);
	}
	if (!isNaN(parseFloat(localStorage.view_center_y))) {
		view_to.center_y = view.center_y = parseFloat(localStorage.view_center_y);
	}
	if (!isNaN(parseFloat(localStorage.view_scale))) {
		view_to.scale = view.scale = parseFloat(localStorage.view_scale);
	}
} catch (e) {
	// ignore
}

setInterval(() => {
	if (editor.editing) {
		// TODO: should probably only save if you pan/zoom
		localStorage.view_center_x = view.center_x.toString();
		localStorage.view_center_y = view.center_y.toString();
		localStorage.view_scale = view_to.scale.toString();
	}
	return;
}, 200);

const redraw = () => {
	world.drawBackground(ctx, view);
	ctx.save();
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.scale(view.scale, view.scale);
	ctx.translate(-view.center_x, -view.center_y);

	world.draw(ctx, view);
	if (editor.editing) {
		editor.draw(ctx, view);
	}

	let show_terrain_polygons: boolean;
	try {
		show_terrain_polygons = localStorage["tiamblia.debug_terrain"] === "true";
	} catch (e) {
		show_terrain_polygons = false;
	}

	if (show_terrain_polygons) {
		for (const entity of world.entities) {
			if (entity instanceof Terrain) {
				ctx.translate(entity.x, entity.y);
				ctx.strokeStyle = entity.solid === false ? "blue" : "red";
				ctx.fillStyle = entity.solid === false ? "rgba(0, 0, 255, 0.2)" : "rgba(255, 0, 0, 0.2)";
				if (entity.intangible) {
					ctx.setLineDash([5, 5]);
					ctx.fillStyle = "transparent";
					ctx.lineWidth = 4 / view.scale;
				} else {
					ctx.lineWidth = 1 / view.scale;
				}
				ctx.beginPath();
				const points = Object.values(entity.structure.points) as { x: number; y: number }[];
				ctx.moveTo(points[0].x, points[0].y);
				for (const point of points) {
					ctx.lineTo(point.x, point.y);
				}
				ctx.closePath();
				ctx.stroke();
				ctx.fill();
				ctx.translate(-entity.x, -entity.y);
				ctx.setLineDash([]);
			}
		}
		for (const entity of world.derived_colliders) {
			ctx.translate(entity.x, entity.y);
			ctx.strokeStyle = entity.solid === false ? "aqua" : "fuchsia";
			ctx.fillStyle = entity.solid === false ? "rgba(0, 255, 255, 0.2)" : "rgba(255, 0, 255, 0.2)";
			ctx.lineWidth = 1 / view.scale;
			ctx.beginPath();
			const points = Object.values(entity.structure.points) as { x: number; y: number }[];
			ctx.moveTo(points[0].x, points[0].y);
			for (const point of points) {
				ctx.lineTo(point.x, point.y);
			}
			ctx.closePath();
			ctx.stroke();
			ctx.fill();
			ctx.translate(-entity.x, -entity.y);
		}
	}

	let show_collision_buckets: boolean;
	try {
		show_collision_buckets = localStorage["tiamblia.show_collision_buckets"] === "true";
	} catch (e) {
		show_collision_buckets = false;
	}

	if (show_collision_buckets) {
		if (editor.editing) {
			world.updateCollisionBuckets(); // normally happens while simulating
		}
		world.drawCollisionBuckets(ctx, view);
	}

	let count_hit_tests: boolean;
	try {
		count_hit_tests = localStorage["tiamblia.count_hit_tests"] === "true";
	} catch (e) {
		count_hit_tests = false;
	}

	if (count_hit_tests) {
		world.drawCollisionHeatMap(ctx, view);
		world.resetCollisionHeatMap();
	}

	let debug_project_point_outside: boolean;
	try {
		debug_project_point_outside = localStorage["tiamblia.debug_project_point_outside"] === "true";
	} catch (e) {
		debug_project_point_outside = false;
	}

	if (debug_project_point_outside) {
		if (editor.editing) {
			world.updateCollisionBuckets(); // normally happens while simulating
		}
		const mouse_world = view.toWorld(mouse);
		const projected = world.projectPointOutside(mouse_world);
		const projected_point = projected?.closest_point_in_world ?? mouse_world;
		ctx.beginPath();
		ctx.arc(projected_point.x, projected_point.y, 5 / view.scale, 0, TAU);
		ctx.fillStyle = "red";
		ctx.fill();
		if (projected) {
			ctx.strokeStyle = "red";
			ctx.lineWidth = 1 / view.scale;
			ctx.beginPath();
			ctx.arc(
				mouse_world.x,
				mouse_world.y,
				Math.hypot(projected_point.x - mouse_world.x, projected_point.y - mouse_world.y),
				0,
				TAU
			);
			ctx.moveTo(mouse_world.x, mouse_world.y);
			ctx.lineTo(projected_point.x, projected_point.y);
			ctx.stroke();
		}
	}

	ctx.restore();
	return;
};

// For console access and quick hacks, some useful globals,
// named to avoid accidental use in game code.
// the_editor.selected_entities is often useful
(window as any).the_world = world;
(window as any).the_entity_classes = (require("skele2d") as any).entityClasses;
(window as any).the_editor = editor;
Object.defineProperty(window, "the_player", {
	get: () => {
		const players = world.entities.filter((e: any) => e instanceof Player);
		if (players.length > 1) {
			console.warn("There's more than one player in the world!");
		}
		return players[0];
	}
});
// You can set a "watch" in the Firefox debugger to `window.do_a_redraw()`
// and then see how entities are changed while stepping through simulation code.
// (This trick doesn't work in Chrome, as of 2023. The canvas doesn't update.)
(window as any).do_a_redraw = redraw;

let gamepad_start_prev = false;

const stats = new Stats();
stats.showPanel(0);

let terrain_optimized = false;

const animate = () => {
	if ((window as any).CRASHED) {
		return;
	}

	let show_stats: boolean;
	try {
		show_stats = localStorage["tiamblia.show_stats"] === "true";
	} catch (e) {
		show_stats = false;
	}

	if (show_stats) {
		if (!stats.dom.parentNode) {
			document.body.appendChild(stats.dom);
		}
	} else {
		stats.dom.remove();
	}

	stats.begin();
	requestAnimationFrame(animate);
	// @ts-ignore
	Math.seedrandom(performance.now());

	if (!gui._hidden) {
		update_property_inspector();
	}

	// Spawn entities for dev purposes, especially for flora.
	// This helps to see the space of randomization.
	let class_names_str: string;
	try {
		class_names_str = localStorage["tiamblia.auto_spawn"] ?? "";
	} catch (e) {
		class_names_str = "";
	}

	const class_names = class_names_str.length > 0 ? class_names_str.split(",") : [];
	try {
		for (const class_name of class_names) {
			const min_instances = 10;
			const existing_instances = world.entities.filter(
				(entity: any) => entity.constructor.name === class_name
			).length;
			if (existing_instances < min_instances) {
				const ent = Entity.fromJSON({ _class_: class_name });
				ent.x = Math.random() * 1000;
				ent.y = bottom_of_world - 1;

				// Fix auto-spawn sometimes leaving entities at the bottom of the world
				world.updateCollisionBuckets();

				while (world.collision(ent)) {
					ent.y -= 3;
				}
				world.entities.push(ent);
				if (ent.dna) {
					// show examples of the same species beside it
					for (let i = 0; i < 3; i++) {
						const clone = Entity.fromJSON({
							_class_: class_name,
							dna: JSON.parse(JSON.stringify(ent.dna))
						});
						clone.x = ent.x + 100 * (i + 1);
						clone.y = bottom_of_world - 1;
						while (world.collision(clone)) {
							clone.y -= 3;
						}
						world.entities.push(clone);
					}
				}
			}
		}
	} catch (error) {
		if (console?.error) {
			console.error("Failed to auto-spawn entities:", error);
		}
	}

	// Hide welcome message after you start playing or toggle editing.
	if (!disable_welcome_message) {
		const has_jumped =
			(window as any).the_world.entities.some(
				(entity: any) => entity instanceof Player && entity.jump
			) ||
			(editor.editing && world_loaded);
		if (has_jumped) {
			if (welcome && welcome.style.opacity !== "0") {
				welcome.style.opacity = "0";
				welcome.style.pointerEvents = "none";
				welcome.addEventListener("transitionend", () => {
					welcome.remove();
					return;
				});
			}
		}
	}

	if (canvas.width !== innerWidth) {
		canvas.width = innerWidth;
	}
	if (canvas.height !== innerHeight) {
		canvas.height = innerHeight;
	}

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	let gamepads: (Gamepad | null)[] = [];
	try {
		gamepads = Array.from(navigator.getGamepads());
	} catch (e) {
		gamepads = [];
	}

	for (const gamepad of gamepads) {
		if (gamepad) {
			if (gamepad.buttons[9].pressed && !gamepad_start_prev) {
				editor.toggleEditing();
			}
			gamepad_start_prev = gamepad.buttons[9].pressed;
		}
	}

	const should_show_grabbable =
		editor.editing &&
		(editor.entities_bar.hovered_cell ||
			((editor.hovered_points.length || editor.hovered_entities.length) &&
				!editor.selection_box));
	if (should_show_grabbable) {
		canvas.classList.add("grabbable");
	} else {
		canvas.classList.remove("grabbable");
	}

	if (editor.editing) {
		// Not sorting while game is running for performance reasons.
		// TODO: run only when an entity is added in the editor.
		// (I could also use the relative sorts list to sort only the added entity,
		// and this could be useful for gameplay code that might want to add entities.)
		sort_entities(world);

		// Fix hair attachment when dragging after simulating.
		// A better fix would be to have an event that fires while dragging
		// (or otherwise moving an entity, such as with the arrow keys, which isn't supported yet.)
		for (const entity of world.entities) {
			if (entity instanceof Player) {
				entity.hair_initialized = false;
			}
		}

		terrain_optimized = false;
	}

	if (!editor.editing) {
		if (!terrain_optimized) {
			world.optimizeTerrain();
			terrain_optimized = true;
		}

		world.updateCollisionBuckets();

		for (const entity of world.entities) {
			entity.step(world, view, mouse);
		}

		// TODO: allow margin of offcenteredness
		const player = world.getEntitiesOfType(Player)[0];
		if (player) {
			view_to.center_x = player.x;
			view_to.center_y = player.y;
			// clamp view so you can't see below the bottom of the world
			// view_to.center_y = Math.min(view_to.center_y, bottom_of_world - canvas.height / 2 / view.scale)
		}
	}

	view.width = canvas.width;
	view.height = canvas.height;

	view.easeTowards(view_to, view_smoothness);
	const player = world.getEntitiesOfType(Player)[0];
	if (player && !editor.editing) {
		// clamp view so you can't see below the bottom of the world even while zooming out
		view.center_y = Math.min(view.center_y, bottom_of_world - canvas.height / 2 / view.scale);
	}

	if (editor.editing) {
		editor.step();
	}
	mouse.resetForNextStep();

	redraw();

	editor.updateGUI();

	// So that the editor will give new random entities each time you pull one into the world
	// (given that some entities use seedrandom, and fix the seed)
	// Also for the below entity randomizing feature.
	// @ts-ignore
	Math.seedrandom(performance.now());

	// A little tool to randomize entities by pressing 'R'
	if (editor.editing && keyboard.wasJustPressed("KeyR")) {
		if (editor.selected_entities.length) {
			editor.undoable(() => {
				randomize_entities(editor.selected_entities);
				return;
			});
		} else {
			let class_names_for_removal: string[];
			try {
				class_names_for_removal = (localStorage["tiamblia.auto_spawn"] || "").split(",");
			} catch (e) {
				class_names_for_removal = [];
			}

			const new_entities = world.entities.filter(
				(entity: any) => !class_names_for_removal.includes(entity.constructor.name)
			);
			if (new_entities.length !== world.entities.length) {
				editor.undoable(() => {
					world.entities = new_entities;
					return;
				});
			}
		}
	}

	// Toggle development UI with backtick/tilde (`/~)
	if (keyboard.wasJustPressed("Backquote")) {
		gui.show(gui._hidden);
	}

	// End of frame. Nothing must use wasJustPressed after this.
	keyboard.resetForNextStep();

	stats.end();
	return;
};

animate();

export {};
