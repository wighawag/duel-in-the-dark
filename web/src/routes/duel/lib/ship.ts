import type {Room} from 'duel-in-the-dark-circuits/duel';

/**
 * The ship's drawing: the eight room outlines of the 2023 duel-in-the-dark
 * ship SVG (front/src/components/Ship.tsx on `main`), with the same room
 * numbering, plus where each room's label goes. Pure data; Ship.svelte draws it.
 */
export const VIEWBOX = '0 0 2324 1774';

export const ROOM_SHAPES: Record<Room, {d: string; label: [number, number]}> = {
	1: {
		d: 'M1890 464l160.96 163.993-374.99 2.553-61.99-105.023L1194 430.5l358-10 338 43.5z',
		label: [1640, 520],
	},
	2: {
		d: 'M2063.49 645.908L2182.5 817l-396 19.904-98-188.442 374.99-2.554z',
		label: [1935, 740],
	},
	3: {
		d: 'M2137 1210l49.5-368.5-379.5 21 54 126.5-355 27-104 264 503-47 232-23z',
		label: [1900, 1090],
	},
	4: {
		d: 'M1593.5 570l225.5 432.5-277.36 19.57L1353 570h240.5z',
		label: [1580, 800],
	},
	5: {
		d: 'M957.133 657.1h253.307l183.4 383.95-323.27 7.85-113.437-391.8z',
		label: [1160, 850],
	},
	6: {
		d: 'M502.793 657.1h389.633l120.444 393.8H602.078l-99.285-393.8z',
		label: [755, 855],
	},
	7: {
		d: 'M606.126 1089.26h664.804l94.44 320H679.416l-73.29-320z',
		label: [985, 1250],
	},
	8: {
		d: 'M421.5 654.5l201 767.5H306L136 654.5h285.5z',
		label: [375, 1040],
	},
};

/** The ship's fixtures that are not rooms (stairs and hatches), drawn as is. */
export const DECOR = {
	stairs: [
		'M1342 930l-33-61h19l35 61h-21zM1386 914l-33-61h19l35 61h-21zM1427 884l-33-61h19l35 61h-21zM1468 869l-33-61h19l35 61h-21z',
		'M1770.5 772l-33-61h19l35 61h-21zM1739 779l-33-61h19l35 61h-21zM1707 788l-33-61h19l35 61h-21zM1685 809l-33-61h19l35 61h-21z',
	],
	hatches: [
		'M1445 379h95v38h-95v-38z',
		'M332 1363h95v38h-95v-38z',
		'M1756.5 957l98.5-10v38l-98.5 10v-38z',
		'M1107 607h95v38h-95v-38z',
		'M669 1285l29 86.5v38l-29-86.5v-38z',
		'M593 1285l29 86.5v38l-29-86.5v-38z',
	],
};
