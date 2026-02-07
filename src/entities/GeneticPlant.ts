const GeneticPlantBase = require("./abstract/Tree.ts");
const { addEntityClass: addGeneticPlantEntityClass } = require("skele2d");
const TAU_GENETIC = Math.PI * 2;

// Standard Normal variate using Box-Muller transform.
const gaussianRandom = (mean: number = 0, standardDeviation: number = 1, random: () => number = Math.random): number => {
	const u = 1 - random(); // Converting [0,1) to (0,1)
	const v = random();
	const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(TAU_GENETIC * v);
	// Transform to the desired mean and standard deviation:
	return z * standardDeviation + mean;
};

interface GeneticBranchParams {
	from: string;
	to: string;
	juice: number;
	angle: number;
	width: number;
	length: number;
}

interface GeneticPoint {
	x: number;
	y: number;
	radius?: number;
	is_leaf?: boolean;
	segment_name?: string;
}

interface DNA {
	branch_color_hue_avg: number;
	branch_color_hue_range: number;
	branch_color_saturation_avg: number;
	branch_color_saturation_range: number;
	branch_color_lightness_avg: number;
	branch_color_lightness_range: number;
	leaf_color_hue_avg: number;
	leaf_color_hue_range: number;
	leaf_color_saturation_avg: number;
	leaf_color_saturation_range: number;
	leaf_color_lightness_avg: number;
	leaf_color_lightness_range: number;

	leaf_size_min: number;
	leaf_size_range: number;
	leaf_aspect: number;
	leaf_bottom_aspect: number;
	leaf_pointedness: number;
	leaf_anti_pointedness: number;
	leaf_rotation_range: number;

	leaf_bunch_min: number;
	leaf_bunch_range: number;
	leaf_bunch_spread_min: number;
	leaf_bunch_spread_range: number;

	trunk_width_min: number;
	trunk_width_range: number;
	trunk_length_min: number;
	trunk_length_range: number;
	branch_width_target_min: number;
	branch_width_target_range: number;
	branch_length_target_min: number;
	branch_length_target_range: number;
	branch_width_change_factor_max: number;
	branch_width_change_factor_range: number;
	branch_length_change_factor_max: number;
	branch_length_change_factor_range: number;

	angle_change_max: number;
	angle_tend_upward: number;
	branching_angle_min: number;
	branching_angle_range: number;
}

class GeneticPlant extends GeneticPlantBase {
	bbox_padding!: number;
	random_index: number = 0;
	random_values: number[] = [];
	dna!: DNA;

	constructor() {
		super();

		this.bbox_padding = 60;

		this.random_index = 0;
		this.random_values = [];

		this.dna = {
			branch_color_hue_avg: gaussianRandom(20, 40),
			branch_color_hue_range: Math.random() < 0.7 ? 0 : gaussianRandom(5, 20),
			branch_color_saturation_avg: Math.random() * 50 + 50,
			branch_color_saturation_range: Math.random() < 0.7 ? 0 : Math.random() * 50,
			branch_color_lightness_avg: gaussianRandom(50, 15),
			branch_color_lightness_range: Math.random() < 0.7 ? 0 : Math.random() * 50,
			leaf_color_hue_avg: gaussianRandom(120, 40),
			leaf_color_hue_range: Math.random() < 0.5 ? 0 : gaussianRandom(5, 30),
			leaf_color_saturation_avg: Math.random() * 50 + 50,
			leaf_color_saturation_range: Math.random() < 0.5 ? 0 : Math.random() * 50,
			leaf_color_lightness_avg: gaussianRandom(50, 15),
			leaf_color_lightness_range: Math.random() < 0.5 ? 0 : Math.random() * 50,

			leaf_size_min: Math.random() * 20 + 2,
			leaf_size_range: Math.random() * 20,
			leaf_aspect: Math.random() * 2 + 0.1,
			leaf_bottom_aspect: Math.random() * 0.5 + 1,
			leaf_pointedness: Math.random(),
			leaf_anti_pointedness: Math.random() * 2 - 1,
			leaf_rotation_range: Math.random() * TAU_GENETIC,

			leaf_bunch_min: Math.random() * 5 + 1,
			leaf_bunch_range: Math.random() * 5,
			leaf_bunch_spread_min: Math.random() * 15 + 1,
			leaf_bunch_spread_range: Math.random() * 15,

			trunk_width_min: Math.random() * 15 + 2,
			trunk_width_range: Math.random() * 10,
			trunk_length_min: Math.random() * 20 + 1,
			trunk_length_range: Math.random() * 20,
			branch_width_target_min: Math.random() * 10 + 1,
			branch_width_target_range: Math.random() * 3,
			branch_length_target_min: Math.random() * 10 + 1,
			branch_length_target_range: Math.random() * 3,
			branch_width_change_factor_max: 1 - Math.random() * 0.1,
			branch_width_change_factor_range: Math.random() * 0.2,
			branch_length_change_factor_max: 1 - Math.random() * 0.2,
			branch_length_change_factor_range: Math.random() * 0.2,

			angle_change_max: Math.random() * 1.5,
			angle_tend_upward: Math.random() * 2,
			branching_angle_min: Math.random() * TAU_GENETIC / 4,
			branching_angle_range: Math.random() * TAU_GENETIC / 4
		};

		this.init();
	}

	init(): void {
		this.structure.clear();
		this.structure.addPoint("base");
		this.branch({
			from: "base",
			to: "1",
			juice: Math.random() * 10 + 5,
			width: this.dna.trunk_width_min + Math.random() * this.dna.trunk_width_range,
			length: this.dna.trunk_length_min + Math.random() * this.dna.trunk_length_range,
			angle: -TAU_GENETIC / 4
		});
	}

	fromJSON(def: any): void {
		super.fromJSON(def);
		// in main.coffee I have a dev helper that creates clones with the same DNA
		// using Entity.fromJSON with just the class name and dna property
		if (def.dna && !def.structure) {
			this.init();
		}
	}

	random(): number {
		// Cached random values for determinism at runtime, not needed during initialization
		this.random_index++;
		if (this.random_values[this.random_index] === undefined) {
			this.random_values[this.random_index] = Math.random();
		}
		return this.random_values[this.random_index];
	}

	gaussianRandom(mean: number = 0, standardDeviation: number = 1): number {
		return gaussianRandom(mean, standardDeviation, () => this.random());
	}

	branch({ from, to, juice, angle, width, length }: GeneticBranchParams): void {
		const name = to;
		angle += (Math.random() * 2 - 1) * this.dna.angle_change_max;

		const dir = { x: Math.cos(angle), y: Math.sin(angle) };
		dir.y -= this.dna.angle_tend_upward;
		angle = Math.atan2(dir.y, dir.x);

		const hue = (((this.dna.branch_color_hue_avg + (this.random() - 0.5) * this.dna.branch_color_hue_range) % 360) + 360) % 360;
		const saturation = Math.min(100, Math.max(0, this.dna.branch_color_saturation_avg + (this.random() - 0.5) * this.dna.branch_color_saturation_range));
		const lightness = Math.min(100, Math.max(0, this.dna.branch_color_lightness_avg + (this.random() - 0.5) * this.dna.branch_color_lightness_range));
		const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

		this.structure.addSegment({ from, name, length, width, color });
		this.structure.points[name].x = this.structure.points[from].x + Math.cos(angle) * length;
		this.structure.points[name].y = this.structure.points[from].y + Math.sin(angle) * length;
		const branch_width_change_factor = this.dna.branch_width_change_factor_max - Math.random() * this.dna.branch_width_change_factor_range;
		const branch_length_change_factor = this.dna.branch_length_change_factor_max - Math.random() * this.dna.branch_length_change_factor_range;
		const width_target = this.dna.branch_width_target_min + Math.random() * this.dna.branch_width_target_range;
		const length_target = this.dna.branch_length_target_min + Math.random() * this.dna.branch_length_target_range;
		width += (width_target - width) * branch_width_change_factor;
		length += (length_target - length) * branch_length_change_factor;
		juice -= 0.3;
		if (juice > 0) {
			this.branch({ from: name, to: `${to}-a`, juice, angle, width, length });
			if (Math.random() < 0.1 - juice / 200) {
				const side = Math.random() < 0.5 ? -1 : 1;
				const branch_angle = angle + side * (this.dna.branching_angle_min + Math.random() * this.dna.branching_angle_range);
				this.branch({ from: name, to: `${to}-b`, juice, angle: branch_angle, width, length });
			}
		} else {
			const leaf_point = this.structure.points[name] as GeneticPoint;
			leaf_point.segment_name = name;
			this.leaf(leaf_point);
		}
	}

	leaf(leaf: GeneticPoint): GeneticPoint {
		leaf.is_leaf = true;
		return leaf;
	}

	draw(ctx: CanvasRenderingContext2D): void {
		this.random_index = 0;

		for (const segment_name in this.structure.segments) {
			const segment = this.structure.segments[segment_name];
			ctx.beginPath();
			ctx.moveTo(segment.a.x, segment.a.y);
			ctx.lineTo(segment.b.x, segment.b.y);
			ctx.lineWidth = segment.width;
			ctx.lineCap = "round";
			ctx.strokeStyle = segment.color;
			ctx.stroke();
		}

		for (const point_name in this.structure.points) {
			const leaf = this.structure.points[point_name] as GeneticPoint;
			if (leaf.is_leaf) {
				this.drawLeaf(ctx, leaf);
			}
		}
	}

	drawLeaf(ctx: CanvasRenderingContext2D, leaf: GeneticPoint): void {
		const segment = this.structure.segments[leaf.segment_name!];
		const angle = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x) + TAU_GENETIC / 4;
		const num_leaves = this.dna.leaf_bunch_min + this.random() * this.dna.leaf_bunch_range;
		const spread = this.dna.leaf_bunch_spread_min + this.random() * this.dna.leaf_bunch_spread_range;
		ctx.save();
		ctx.translate(leaf.x, leaf.y);
		ctx.rotate(angle);
		for (let i = 0; i <= num_leaves; i++) {
			const size = this.dna.leaf_size_min + this.random() * this.dna.leaf_size_range;
			const offset = this.random() * spread;
			ctx.translate(0, offset);
			ctx.save();
			ctx.rotate(this.random() * this.dna.leaf_rotation_range);
			ctx.beginPath();
			ctx.scale(size, size);
			const w = this.dna.leaf_aspect;
			const wb = w * this.dna.leaf_bottom_aspect;
			const h = 1;
			const p = this.dna.leaf_pointedness;
			const ap = this.dna.leaf_anti_pointedness;
			ctx.translate(0, -h);
			ctx.moveTo(0, 0);
			ctx.bezierCurveTo(w, p, w, h - ap, 0, h);
			ctx.bezierCurveTo(-wb, h - ap, -wb, p, 0, 0);

			ctx.closePath();
			const hue = (((this.dna.leaf_color_hue_avg + (this.random() - 0.5) * this.dna.leaf_color_hue_range) % 360) + 360) % 360;
			const saturation = Math.min(100, Math.max(0, this.dna.leaf_color_saturation_avg + (this.random() - 0.5) * this.dna.leaf_color_saturation_range));
			const lightness = Math.min(100, Math.max(0, this.dna.leaf_color_lightness_avg + (this.random() - 0.5) * this.dna.leaf_color_lightness_range));
			ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
			ctx.fill();
			ctx.restore();
		}
		ctx.restore();
	}
}

addGeneticPlantEntityClass(GeneticPlant);
module.exports = GeneticPlant;
