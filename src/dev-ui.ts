const skele2d = require("skele2d");
const { GUI, Controller } = require("lil-gui");
const idb_keyval = require("idb-keyval");

const Skele2DEntity = skele2d.Entity;

interface OptionNamesToKeys {
	[key: string]: string;
}

interface Options {
	[key: string]: boolean | string;
}

interface Icons {
	[key: string]: number;
}

interface Link {
	name: string;
	action?: () => void;
}

interface Breadcrumb {
	entity: any;
	key: string | null;
}

// FileSystem API types (not fully supported in TypeScript yet)
interface FileSystemHandlePermissionDescriptor {
	mode?: "read" | "readwrite";
}

// Extend FileSystemFileHandle to include permission methods
interface ExtendedFileSystemFileHandle extends FileSystemFileHandle {
	queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
	requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

// dependencies injected via configure_property_inspector()
let editor: any = null;
let world: any = null;

// UI for development features, accessible with the backtick/tilde (`/~) key
const gui = new GUI();
gui.hide();

const option_names_to_keys: OptionNamesToKeys = {
	"Disable welcome message, start in edit mode": "tiamblia.disable_welcome_message",
	"Show performance stats": "tiamblia.show_stats",
	"Debug projectPointOutside": "tiamblia.debug_project_point_outside",
	"Debug Caterpillar class": "tiamblia.debug_caterpillar",
	"Debug Arrow class": "tiamblia.debug_arrow",
	"Debug Terrain class": "tiamblia.debug_terrain",
	"Show collision buckets": "tiamblia.show_collision_buckets",
	"Show hit tested buckets": "tiamblia.count_hit_tests",
	"Show point names": "Skele2D show names",
	"Show point indices": "Skele2D show indices",
	"Allow posing animatable entities in world": "Skele2D allow posing animatable entities in world",
	"Disable constraint solving while editing": "Skele2D disable constraint solving"
};

const options: Options = {};
const tiamblia_folder = gui.addFolder("Tiamblia");
const skele2d_folder = gui.addFolder("Skele2D");
const entity_folder = gui.addFolder("Selected Entity");

for (const name in option_names_to_keys) {
	const storage_key = option_names_to_keys[name];
	try {
		options[name] = localStorage[storage_key] === "true";
	} catch (error) {
		options[name] = false;
	}
	const folder = storage_key.indexOf("Skele2D") === 0 ? skele2d_folder : tiamblia_folder;
	folder.add(options, name).onChange((value: boolean) => {
		localStorage[storage_key] = String(value);
	});
}

try {
	options["Auto-spawn entities"] = localStorage["tiamblia.auto_spawn"] || "";
} catch (error) {
	options["Auto-spawn entities"] = "";
}
tiamblia_folder.add(options, "Auto-spawn entities").onChange((value: string) => {
	localStorage["tiamblia.auto_spawn"] = value;
});

let file_handle: ExtendedFileSystemFileHandle | null = null;

// Verify the user has granted permission to read or write to the file, if
// permission hasn't been granted, request permission.
// getFile() can fail without requesting permission.
//
// @param file_handle File handle to check.
// @param with_write whether write permission should be checked.
// @return whether the user has granted read/write permission.
async function verify_permission(file_handle: ExtendedFileSystemFileHandle, with_write: boolean): Promise<boolean> {
	const options: FileSystemHandlePermissionDescriptor = {};
	if (with_write) {
		options.mode = "readwrite";
	}
	if (await file_handle.queryPermission(options) === "granted") {
		return true;
	}
	if (await file_handle.requestPermission(options) === "granted") {
		return true;
	}
	return false;
}

async function clear_auto_save(): Promise<void> {
	if (!confirm("Are you sure you want to reload the default world?")) {
		return;
	}
	localStorage.removeItem("Skele2D World");
	file_handle = null;
	await idb_keyval.del("tiamblia.file_handle");
	try {
		const default_file_handle = await idb_keyval.get("tiamblia.default_world_file_handle");
		if (default_file_handle) {
			if (!(await verify_permission(default_file_handle as ExtendedFileSystemFileHandle, false))) {
				alert("Auto-save cleared. If you want to get it back, edit something. If you want to load the default world, refresh the page.");
				return;
			}
			const file = await (default_file_handle as ExtendedFileSystemFileHandle).getFile();
			const json = await file.text();
			load_from_json(json);
			file_handle = default_file_handle as ExtendedFileSystemFileHandle;
			await idb_keyval.set("tiamblia.file_handle", file_handle);
			return;
		} else {
			location.reload();
			return;
		}
	} catch (exception) {
		alert(`Cleared Skele2D World, but failed to load default world:\n\n${exception}\n\nRefresh the page to start over.`);
		return;
	}
}

idb_keyval.get("tiamblia.file_handle").then((value: ExtendedFileSystemFileHandle | undefined) => {
	file_handle = value || null;
});

function load_from_json(json: string): boolean {
	let parsed: any;
	try {
		parsed = JSON.parse(json);
	} catch (error) {
		editor.warn(`Failed to parse file as JSON: ${error}`);
		return false;
	}
	editor.undoable(() => {
		try {
			editor.fromJSON({ world: parsed, selected_entity_ids: [], editing_entity_id: null, selected_point_names: [] });
		} catch (error) {
			editor.warn(`Failed to load world: ${error}`);
		}
		return false;
	});
	return true;
}

function store_file_handle(file_handle: ExtendedFileSystemFileHandle): void {
	idb_keyval.set("tiamblia.file_handle", file_handle);
	if (file_handle.name === "world.json") {
		idb_keyval.set("tiamblia.default_world_file_handle", file_handle);
	}
}

async function file_open(): Promise<void> {
	if (typeof (window as any).showOpenFilePicker !== "undefined") {
		try {
			const [new_file_handle] = await (window as any).showOpenFilePicker({ accept: [{ description: "JSON", extensions: ["json"] }] });
			const file = await new_file_handle.getFile();
			const json = await file.text();
			if (load_from_json(json)) {
				file_handle = new_file_handle;
				if (file_handle) {
					store_file_handle(file_handle);
				}
			}
		} catch (exception: any) {
			if (exception.name === "AbortError") {
				return;
			}
			editor.warn(`Failed to open file: ${exception}`);
			return;
		}
	} else {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = () => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === "string") {
					load_from_json(reader.result);
				}
			};
			if (input.files && input.files[0]) {
				reader.readAsText(input.files[0]);
			}
		};
		input.click();
	}
}

async function file_save_as(): Promise<void> {
	const json = JSON.stringify(world.toJSON(), null, "\t");
	if (typeof (window as any).showSaveFilePicker !== "undefined") {
		try {
			file_handle = await (window as any).showSaveFilePicker({ types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
			if (!file_handle || !(await verify_permission(file_handle, true))) {
				return;
			}
			const writable = await file_handle.createWritable();
			await writable.write(json);
			await writable.close();
		} catch (exception: any) {
			if (exception.name === "AbortError") {
				return;
			}
			editor.warn(`Failed to save file: ${exception}`);
			return;
		}
		if (file_handle) {
			store_file_handle(file_handle);
		}
	} else {
		const a = document.createElement("a");
		a.href = "data:application/json;charset=utf-8," + encodeURIComponent(json);
		a.download = "Tiamblia World.json";
		a.click();
	}
}

async function file_save(): Promise<void> {
	if (file_handle) {
		const json = JSON.stringify(world.toJSON(), null, "\t");
		try {
			if (!(await verify_permission(file_handle, true))) {
				return;
			}
			const writable = await file_handle.createWritable();
			await writable.write(json);
			await writable.close();
		} catch (error) {
			editor.warn(`Failed to save file: ${error}`);
			return;
		}
	} else {
		await file_save_as();
	}
}

addEventListener("keydown", (event: KeyboardEvent) => {
	if (event.key === "s" && event.ctrlKey) {
		event.preventDefault();
		file_save();
	}
	if (event.key === "o" && event.ctrlKey) {
		event.preventDefault();
		file_open();
	}
});

const icons: Icons = {
	open: 53,
	save: 22,
	save_as: 22.2,
	revert: 76.2
};

function add_button(folder: typeof GUI.prototype, name: string, icon: number, callback: () => void): void {
	const button_controller = folder.add({ [name]: callback }, name);
	const img = document.createElement("img");
	let icon_number = icon;
	if (icon === 22.2) {
		icon_number = 22;
		img.style.transform = "scale(0.8) translate(-2px, -2px)";
		img.style.filter = "drop-shadow(3px 3px 0px hsl(200, 80%, 40%)";
	}
	if (icon === 76.2) {
		icon_number = 76;
		img.style.filter = "hue-rotate(180deg)";
	}
	img.src = `icons/png/${icon_number}.png`;
	img.style.marginRight = "5px";
	img.style.marginLeft = "70px";
	button_controller.$name.prepend(img);
	button_controller.$name.style.textAlign = "left";
}

add_button(skele2d_folder, "Clear Auto-Save", icons.revert, clear_auto_save);
add_button(skele2d_folder, "Load World", icons.open, file_open);
add_button(skele2d_folder, "Save World", icons.save, file_save);
add_button(skele2d_folder, "Save World As", icons.save_as, file_save_as);

let last_selected_entity: any = null;

// lil-gui.js doesn't support an onBeforeChange callback,
// so we have to do this hack to integrate with the undo system.
// Another way might be with a Proxy, might be cleaner.
// This is debounced because it's called a lot while dragging controllers.
// `undoable()` will save, but if we're debouncing it, we need to save manually.
let last_undoable_time = -Infinity;
let save_timeout: ReturnType<typeof setTimeout> | null = null;
const ms_between_undos = 300;
const ms_idle_before_saving = ms_between_undos * 2;

const old_Controller_setValue = Controller.prototype.setValue;
(Controller.prototype.setValue as any) = function (this: any, value: any) {
	let controller_edits_entity = false;
	let c: any = this;
	while (c) {
		if (c.object instanceof Skele2DEntity) {
			controller_edits_entity = true;
			break;
		}
		c = c.parent;
	}
	if (controller_edits_entity) {
		if (save_timeout !== null) {
			clearTimeout(save_timeout);
		}
		save_timeout = setTimeout(() => {
			editor.save();
		}, ms_idle_before_saving);
		if (performance.now() - last_undoable_time > ms_between_undos) {
			editor.undoable(() => {
				old_Controller_setValue.call(this, value);
			});
			last_undoable_time = performance.now();
		} else {
			old_Controller_setValue.call(this, value);
		}
	} else {
		old_Controller_setValue.call(this, value);
	}
};

function style_button_as_link(button: HTMLButtonElement): void {
	button.style.background = "none";
	button.style.border = "none";
	button.style.padding = "0";
	button.style.font = "inherit";
	button.style.cursor = "pointer";
	button.style.color = "#2277FF";
	button.style.textDecoration = "underline";
	button.style.textAlign = "left";
	button.style.fontWeight = "bold";
}

// The ButtonController doesn't look good in the inspector, for linked entities.
// Note that this class uses a different constructor signature than ButtonController,
// because it doesn't use the object's property as the function, nor the key as name.
class LinkButtonController extends Controller {
	$button: HTMLButtonElement;

	constructor(parent: typeof GUI.prototype, object: object, property: string, link_name: string, link_action: () => void) {
		super(parent, object, property, "link-button-controller");

		this.$button = document.createElement("button");
		this.$button.textContent = link_name;

		style_button_as_link(this.$button);

		this.$button.addEventListener("click", () => {
			link_action();
		});

		this.$widget.append(this.$button);

		this.updateDisplay();
	}

	updateDisplay(): this {
		return this;
	}
}

class BreadcrumbsController extends Controller {
	$buttons: HTMLButtonElement[];

	constructor(parent: typeof GUI.prototype, object: object, property: string, links: Link[]) {
		super(parent, object, property, "breadcrumbs-controller");

		this.$buttons = [];
		for (let link_index = 0; link_index < links.length; link_index++) {
			const link = links[link_index];
			const button = document.createElement("button");
			button.textContent = link.name;

			style_button_as_link(button);

			button.addEventListener("click", () => {
				if (link.action) {
					link.action();
				}
			});

			button.style.width = "auto";

			if (!link.action) {
				button.disabled = true;
				button.style.color = "inherit";
				button.style.textDecoration = "none";
				button.style.cursor = "default";
			}

			this.$widget.append(button);
			if (link_index !== links.length - 1) {
				const span = document.createElement("span");
				span.textContent = " ❱ ";
				span.style.color = "#777";
				this.$widget.append(span);
			}
			this.$buttons.push(button);
		}

		this.$widget.style.display = "inline-block";
		this.$name.style.display = "none";

		this.updateDisplay();
	}

	updateDisplay(): this {
		return this;
	}
}

// "waves" is old, it shouldn't be on the Water entity anymore
const property_inspector_exclusions = ["_class_", "structure", "random_values", "simplex", "waves_y", "waves_vy", "bubbles", "waves"];

function inspect_entity(selected_entity: any, breadcrumbs: Breadcrumb[] = []): void {
	// Note: selected_entity may be null/undefined, for deselection
	for (let i = entity_folder.children.length - 1; i >= 0; i--) {
		entity_folder.children[i].destroy();
	}
	if (breadcrumbs.length > 1) {
		new BreadcrumbsController(entity_folder, {}, "", breadcrumbs.map((breadcrumb, breadcrumb_index) => ({
			name: breadcrumb.entity.constructor.name,
			action: breadcrumb.entity !== selected_entity ? () => {
				editor.selected_entities = [breadcrumb.entity];
				inspect_entity(breadcrumb.entity, breadcrumbs.slice(0, breadcrumb_index + 1));
				last_selected_entity = breadcrumb.entity;
			} : undefined
		})));
	}

	function make_controllers(object: any, folder: typeof GUI.prototype): void {
		for (const key in object) {
			if (property_inspector_exclusions.indexOf(key) !== -1) {
				continue;
			}
			const value = object[key];
			if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
				if (key.match(/color/i) && typeof value === "string" && value[0] === "#" && (value.length === 4 || value.length === 7)) {
					folder.addColor(object, key);
				} else {
					folder.add(object, key);
				}
			} else if (typeof value === "object" && value) {
				if (Array.isArray(value)) {
					if (value.length > 0) {
						const array_folder = folder.addFolder(key);
						array_folder.title(`${key} (${value.length})`);
						array_folder.close();
						make_controllers(Object.assign({}, value), array_folder);
					}
				} else if (value.constructor === Object) {
					const new_folder = folder.addFolder(key);
					new_folder.title(`${key} {...}`);
					make_controllers(value, new_folder);
				} else if (value instanceof Skele2DEntity) {
					const button_fn = () => {
						editor.selected_entities = [value];
						const new_breadcrumb: Breadcrumb = {
							entity: value,
							key: key
						};
						inspect_entity(value, [...breadcrumbs, new_breadcrumb]);
						last_selected_entity = value;
					};
					new LinkButtonController(folder, object, key, value.constructor.name, button_fn);
				} else {
					console.log(`Unknown type for ${key}: ${value.constructor.name}`);
				}
			} else if (value) {
				console.log(`Unknown type for ${key}: ${typeof value}`);
			} else {
				console.log(`Skipping ${value} value for ${key}`);
			}
		}
	}

	make_controllers(selected_entity, entity_folder);
	if (selected_entity) {
		entity_folder.title(`Selected Entity (${selected_entity.constructor.name})`);
	} else {
		entity_folder.title("Selected Entity");
	}
}

function update_property_inspector(): void {
	const selected_entity = editor.selected_entities[0];
	if (last_selected_entity !== selected_entity) {
		last_selected_entity = selected_entity;
		inspect_entity(selected_entity, selected_entity ? [{ entity: selected_entity, key: null }] : []);
	} else {
		for (const controller of entity_folder.controllersRecursive()) {
			controller.updateDisplay();
		}
	}
}

module.exports.gui = gui;
module.exports.update_property_inspector = update_property_inspector;
module.exports.configure_property_inspector = (dependencies: { editor: any; world: any }) => {
	editor = dependencies.editor;
	world = dependencies.world;
};
