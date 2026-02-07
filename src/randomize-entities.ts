const { Structure } = require("skele2d");

const randomize_entities = (entities: any[]): void => {
	for (const entity of entities) {
		// Use two new entities to detect what properties get randomized,
		// and change only those.
		// (If you just used one new entity, you couldn't distinguish between
		// properties that were different because they were randomized at construction,
		// or because they were manually modified, such as by posing an entity,
		// or modified by simulation, although that's less important.)
		const new_entity_a = new entity.constructor();
		const new_entity_b = new entity.constructor();
		const apply_differences = (a: any, b: any, cur: any): void => {
			for (const key in a) {
				if (a.hasOwnProperty(key) && key !== "id") {
					const val_a = a[key];
					const val_b = b[key];
					if (val_a instanceof Structure) {
						// Replace the structure wholesale.
						// Avoids issues with trees, which would get split up with floating branches.
						if (JSON.stringify(val_a) !== JSON.stringify(val_b)) {
							cur[key] = val_a;
						}
					} else if (Array.isArray(val_a)) {
						// Replace the array wholesale.
						// That way it can shrink, and can't leave blanks in the middle.
						// If e.g. a = [1, 0, 1] and b = [1, 0, 1, 0, 1] and cur = []
						// the "object" path could leave cur = [, , , 0, 1], I think.
						if (JSON.stringify(val_a) !== JSON.stringify(val_b)) {
							cur[key] = val_a;
						}
					} else if (
						typeof val_a === "object" && val_a !== null &&
						typeof val_b === "object" && val_b !== null &&
						typeof cur[key] === "object" && cur[key] !== null
					) {
						apply_differences(val_a, val_b, cur[key]);
					} else if (val_a !== val_b) {
						cur[key] = val_a;
					}
				}
			}
			return;
		};
		apply_differences(new_entity_a, new_entity_b, entity);
	}
	return;
};

module.exports = randomize_entities;
