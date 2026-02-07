const keys: { [code: string]: boolean } = {};
let prev_keys: { [code: string]: boolean } = {};

addEventListener("keydown", (e: KeyboardEvent) => { keys[e.code] = true; });
addEventListener("keyup", (e: KeyboardEvent) => { delete keys[e.code]; });

const keyboard = {
	wasJustPressed: (code: string): boolean => {
		return keys[code] !== undefined && prev_keys[code] === undefined;
	},
	isHeld: (code: string): boolean => {
		return keys[code] !== undefined;
	},
	resetForNextStep: (): void => {
		prev_keys = {};
		for (const k in keys) {
			prev_keys[k] = keys[k];
		}
		return;
	}
};

module.exports = keyboard;
