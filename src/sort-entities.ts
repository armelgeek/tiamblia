const SortTerrain = require("./entities/abstract/Terrain.ts");
const SortWater = require("./entities/terrain/Water.coffee");
const SortCloud = require("./entities/Cloud.coffee");
const SortDeer = require("./entities/Deer.coffee");
const SortPlayer = require("./entities/Player.coffee");
const SortBow = require("./entities/items/Bow.coffee");
const SortArrow = require("./entities/items/Arrow.coffee");
const SortArcheryTarget = require("./entities/items/ArcheryTarget.coffee");

type EntityClass = new (...args: any[]) => any;
type EntityFilter = (entity: any) => boolean;

const c = (entity_class: EntityClass): EntityFilter => (entity: any): boolean => entity instanceof entity_class;
const anything_other_than_c = (entity_class: EntityClass): EntityFilter => (entity: any): boolean => !(entity instanceof entity_class);

const relative_sorts: Array<[EntityFilter, EntityFilter]> = [
	// [A, B] denotes A in front of B
	// If the filters result in true for a pair and its reverse,
	// it will be handled below and shouldn't cause instability.

	// The one background element.
	[anything_other_than_c(SortCloud), c(SortCloud)],
	// The archery target is effectively a line, but displayed as an oval, implying perspective.
	// Arrows need to be visible when sticking into the target.
	[c(SortArrow), c(SortArcheryTarget)],
	// For riding, player's legs go in front; it's implied that one goes behind,
	// by posing the legs on top of each other.
	// Note: there's also a special rule that makes sure there's nothing between the player and the deer.
	[c(SortPlayer), c(SortDeer)],
	// It looks best holding the arrow in front of the bow.
	[c(SortArrow), c(SortPlayer)],
	// Player now manually sorts Bow in relation to itself (when holding it)
	// [c(Player), c(Bow)] // can look better in some cases, but not while aiming or turning
	// [c(Bow), c(Player)]
	[c(SortArrow), c(SortBow)],

	// Water is transparent, and it should discolor any entities submerged in it.
	// [c(Water), anything_other_than_c(Terrain)]
	// For the reflection effect, the water should be drawn after the terrain too.
	[c(SortWater), anything_other_than_c(SortWater)],
	
	// This may end up being too general
	// I'm keeping it at the end so any rules can override it
	[anything_other_than_c(SortTerrain), c(SortTerrain)]
];

const compare_entities = (a: any, b: any): number => {
	// This comparator is intransitive, so it can't be used for sort().
	for (const [a_filter, b_filter] of relative_sorts) {
		if (a_filter(a) && b_filter(b) && !b_filter(a) && !a_filter(b)) {
			return 1;
		}
		if (b_filter(a) && a_filter(b) && !a_filter(a) && !b_filter(b)) {
			return -1;
		}
	}
	// If we get here, we don't know which should be in front.
	return 0;
};

const topological_sort = (array: any[], comparator: (a: any, b: any) => number): any[] => {
	// Construct the adjacency list and reverse adjacency list
	const adjacency_list = new Map<any, any[]>();
	const reverse_adjacency_list = new Map<any, any[]>();
	for (const node of array) {
		adjacency_list.set(node, []);
		reverse_adjacency_list.set(node, []);
	}
	for (let i = 0; i < array.length; i++) {
		for (let j = i + 1; j < array.length; j++) {
			const comparison = comparator(array[i], array[j]);
			if (comparison < 0) {
				adjacency_list.get(array[i])!.push(array[j]);
				reverse_adjacency_list.get(array[j])!.push(array[i]);
			} else if (comparison > 0) {
				adjacency_list.get(array[j])!.push(array[i]);
				reverse_adjacency_list.get(array[i])!.push(array[j]);
			}
		}
	}

	// Perform the topological sort using Kahn's algorithm
	const in_degree = new Map<any, number>();
	for (const [node, neighbors] of reverse_adjacency_list) {
		in_degree.set(node, neighbors.length);
	}
	const queue: any[] = [];
	for (const [node, degree] of in_degree) {
		if (degree === 0) {
			queue.push(node);
		}
	}
	const result: any[] = [];
	while (queue.length > 0) {
		const node = queue.shift()!;
		result.push(node);
		for (const neighbor of adjacency_list.get(node)!) {
			in_degree.set(neighbor, in_degree.get(neighbor)! - 1);
			if (in_degree.get(neighbor) === 0) {
				queue.push(neighbor);
			}
		}
	}

	// Check for cycles and throw an error if found
	if (result.length !== array.length) {
		for (const item of array) {
			if (!result.includes(item)) {
				const cycle = [item];
				let current = adjacency_list.get(item)![0];
				while (current !== item) {
					cycle.push(current);
					current = adjacency_list.get(current)![0];
				}
				cycle.push(item);
				const cycle_str = cycle.map((item) => `${item}` === "[object Object]" ? item.constructor.name : item).join(" > ");
				throw new Error("Comparator is inconsistent. Cycle: " + cycle_str);
			}
		}
	}

	// Return the topologically sorted array
	return result;
};

interface World {
	entities: any[];
	getEntitiesOfType(entityClass: EntityClass): any[];
}

const sort_entities = (world: World): void => {
	const before_sort = world.entities.slice();
	// world.entities.sort(compare_entities)
	// sort() is stable, but it will fail to sort [a, b, c] if there is only a rule for [a, c]
	// It takes 0 to mean "equal", not "unknown".
	// We need a sorting algorithm that compares more than just adjacent pairs,
	// and gives a total ordering, with an intransitive comparator.

	// Bubble sort doesn't work either.
	// n = world.entities.length
	// loop
	// 	new_n = 0
	// 	for i in [1...n]
	// 		a = world.entities[i - 1]
	// 		b = world.entities[i]
	// 		if compare_entities(a, b) > 0
	// 			world.entities[i - 1] = b
	// 			world.entities[i] = a
	// 			new_n = i
	// 	n = new_n
	// 	break if n <= 1

	// An insertion sort that DOESN'T work with an intransitive comparator:
	// i = 1
	// while i < world.entities.length
	// 	x = world.entities[i]
	// 	j = i - 1
	// 	while j >= 0 and compare_entities(world.entities[j], x) > 0
	// 		world.entities[j + 1] = world.entities[j]
	// 		j -= 1
	// 	world.entities[j + 1] = x
	// 	i += 1

	// An insertion sort that DOES work with an intransitive comparator:
	// new_list = []
	// for entity in world.entities
	// 	inserted = false
	// 	for i in [0...new_list.length]
	// 		if compare_entities(entity, new_list[i]) < 0
	// 			new_list.splice(i, 0, entity)
	// 			inserted = true
	// 			break
	// 	new_list.push(entity) unless inserted
	// world.entities = new_list

	// Topological sort is better because it can tell us if there is a cycle, i.e. inconsistency.
	world.entities = topological_sort(world.entities, compare_entities);

	// If there are any Deer, make sure there are no trees or anything between them and the Player.
	// This is a special case because it can't be expressed as "A goes above B".
	// Trees should be allowed to go above or below both the player and steed, but not between them.
	// This rule moves the Deer closer to the Player in depth.
	const steeds = world.getEntitiesOfType(SortDeer);
	const players = world.getEntitiesOfType(SortPlayer);
	for (const steed of steeds) {
		const player = players[0];
		const player_index = world.entities.indexOf(player);
		const steed_index = world.entities.indexOf(steed);
		if (player && player_index - steed_index > 1) {
			let non_steed_between = false;
			for (const entity of world.entities.slice(steed_index + 1, player_index)) {
				if (!(entity instanceof SortDeer)) {
					non_steed_between = true;
					break;
				}
			}
			if (non_steed_between) {
				world.entities.splice(world.entities.indexOf(steed), 1);
				world.entities.splice(world.entities.indexOf(player), 0, steed);
				console.log(`Sorted ${steed.constructor.name} closer to ${player.constructor.name}`);
			}
		}
	}

	const changed = world.entities.some((entity, i) => entity !== before_sort[i]);
	if (changed) {
		console.log("Sort changed");
		console.log("Before: " + before_sort.map((e) => e.constructor.name).join(", "));
		console.log("After: " + world.entities.map((e) => e.constructor.name).join(", "));
	}
	return;
};

module.exports = sort_entities;

(window as any).topological_sort = topological_sort;
