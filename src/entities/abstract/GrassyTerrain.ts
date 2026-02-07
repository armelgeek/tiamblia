const TerrainBase = require("../abstract/Terrain.ts");
const { lineSegmentsIntersect: lineSegmentsIntersectHelper } = require("skele2d").helpers;

interface Point {
	x: number;
	y: number;
}

interface Segment {
	a: Point;
	b: Point;
}

interface Structure {
	points: { [key: string]: Point };
	segments: { [key: string]: Segment };
	onchange?: () => void;
}

interface Blade {
	x: number;
	y: number;
	visible?: boolean;
}

interface GrassTile {
	dark_blades: Blade[];
	light_blades: Blade[];
}

interface View {
	fromWorld(point: Point): Point;
	testRect(x: number, y: number, width: number, height: number, margin: number): boolean;
}

interface SimplexNoise {
	noise2D(x: number, y: number): number;
}

class GrassyTerrain extends TerrainBase {
	bbox_padding!: number;
	grass_tiles!: Map<string, GrassTile>;
	color!: string;
	color_dark!: string;
	color_light!: string;
	structure!: Structure;
	simplex!: SimplexNoise;
	x!: number;
	y!: number;

	constructor() {
		super();
		this.bbox_padding = 30;
		this.grass_tiles = new Map();
		this.structure.onchange = () => {
			this.grass_tiles.forEach((tile) => {
				for (const shade of ["dark", "light"]) {
					for (const blade of tile[`${shade}_blades` as keyof GrassTile] as Blade[]) {
						delete blade.visible;
					}
				}
			});
		};
		this.color = "#C29853";
		this.color_dark = "#A17A3F";
		this.color_light = "#D2B06A";
	}

	toJSON(): any {
		const def: any = {};
		const superDef = super.toJSON();
		for (const k in superDef) {
			if (k !== "grass_tiles") {
				def[k] = superDef[k];
			}
		}
		return def;
	}

	toWorld(point: Point): Point {
		return { x: point.x + this.x, y: point.y + this.y };
	}

	bbox(): { x: number; y: number; width: number; height: number } {
		return super.bbox();
	}

	draw(ctx: CanvasRenderingContext2D, view: View): void {
		const rect_contains_any_points = (x: number, y: number, width: number, height: number): boolean => {
			let contains_any_points = false;
			for (const point_name in this.structure.points) {
				const point = this.structure.points[point_name];
				if (x <= point.x && point.x <= x + width && y <= point.y && point.y <= y + height) {
					contains_any_points = true;
				}
			}
			return contains_any_points;
		};

		const rect_is_empty = (x: number, y: number, width: number, height: number): boolean => {
			const center_point = { x: this.x + x + width / 2, y: this.y + y + height / 2 };
			const view_point = view.fromWorld(center_point);
			const center_of_rect_is_in_polygon = ctx.isPointInPath(view_point.x, view_point.y);
			for (const segment_name in this.structure.segments) {
				const segment = this.structure.segments[segment_name];
				if (
					lineSegmentsIntersectHelper(x, y, x, y + height, segment.a.x, segment.a.y, segment.b.x, segment.b.y) ||
					lineSegmentsIntersectHelper(x, y, x + width, y, segment.a.x, segment.a.y, segment.b.x, segment.b.y) ||
					lineSegmentsIntersectHelper(x + width, y, x + width, y + height, segment.a.x, segment.a.y, segment.b.x, segment.b.y) ||
					lineSegmentsIntersectHelper(x, y + height, x + width, y + height, segment.a.x, segment.a.y, segment.b.x, segment.b.y)
				) {
					return false;
				}
			}
			return !center_of_rect_is_in_polygon;
		};

		ctx.beginPath();
		for (const point_name in this.structure.points) {
			const point = this.structure.points[point_name];
			ctx.lineTo(point.x, point.y);
		}
		ctx.closePath();
		ctx.fillStyle = this.color;
		ctx.fill();
		(Math as any).seedrandom(5);
		const random = Math.random;

		const dark_blades: Blade[] = [];
		const light_blades: Blade[] = [];
		const bbox = this.bbox();
		const tile_size = 300;

		const left = bbox.x - this.x;
		const top = bbox.y - this.y;
		const right = left + bbox.width;
		const bottom = top + bbox.height;
		const first_tile_xi = Math.floor(left / tile_size);
		const last_tile_xi = Math.floor(right / tile_size);
		const first_tile_yi = Math.floor(top / tile_size);
		const last_tile_yi = Math.floor(bottom / tile_size);

		for (let tile_xi = first_tile_xi; tile_xi <= last_tile_xi; tile_xi++) {
			for (let tile_yi = first_tile_yi; tile_yi <= last_tile_yi; tile_yi++) {
				const tile_name = `(${tile_xi}, ${tile_yi})`;
				const tile_x = tile_xi * tile_size;
				const tile_y = tile_yi * tile_size;

				let tile = this.grass_tiles.get(tile_name);
				const contains_any_points = rect_contains_any_points(tile_x, tile_y, tile_size, tile_size);
				if (contains_any_points || !rect_is_empty(tile_x, tile_y, tile_size, tile_size)) {
					if (!tile) {
						tile = {
							dark_blades: [],
							light_blades: []
						};
						for (let i = 0; i <= 350; i++) {
							let x = tile_x + random() * tile_size;
							let y = tile_y + random() * tile_size;
							for (let j = 0; j <= random() * 3 + 1; j++) {
								const shade = random() < 0.5 ? "dark" : "light";
								tile[`${shade}_blades`].push({ x, y });
								x += (random() + 1) * 3;
							}
						}
						this.grass_tiles.set(tile_name, tile);
					}

					for (const shade of ["dark", "light"]) {
						for (const blade of tile[`${shade}_blades` as keyof GrassTile] as Blade[]) {
							const point = this.toWorld(blade);
							if (view.testRect(point.x, point.y - 10, 0, 10, 15)) {
								const view_point = view.fromWorld(point);
								if (blade.visible ?? (blade.visible = ctx.isPointInPath(view_point.x, view_point.y))) {
									(shade === "dark" ? dark_blades : light_blades).push(blade);
								}
							}
						}
					}
				}
			}
		}

		ctx.beginPath();
		for (const { x, y } of dark_blades) {
			ctx.moveTo(x, y);
			ctx.lineTo(
				x + this.simplex.noise2D(-x + y + 78 + Date.now() / 2000, y + 549) * 5,
				y - (2 + this.simplex.noise2D(y * 40.45, x + 340)) * 10
			);
		}
		ctx.strokeStyle = this.color_dark;
		ctx.stroke();

		ctx.beginPath();
		for (const { x, y } of light_blades) {
			ctx.moveTo(x, y);
			ctx.lineTo(
				x + this.simplex.noise2D(-x + y + 78 + Date.now() / 2000, y + 549) * 5,
				y - (2 + this.simplex.noise2D(y * 40.45, x + 340)) * 10
			);
		}
		ctx.strokeStyle = this.color_light;
		ctx.stroke();
	}
}

module.exports = GrassyTerrain;
