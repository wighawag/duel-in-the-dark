import type {MatchSummary} from './game';

/**
 * Everything the page asks about one match from one player's point of view,
 * worked out here so that the component only renders. Pure: the same match,
 * player and time always give the same answer.
 */
export type MatchRole = {
	seat: number | undefined;
	/** an open match this player could join */
	canJoin: boolean;
	/** the creator of an open match, who can still cancel it */
	canCancel: boolean;
	myTurn: boolean;
	/** the opponent guessed and this player owes a proven answer */
	mustAnswer: boolean;
	/** waiting on the opponent to answer this player's guess */
	waitingForAnswer: boolean;
	/** the deadline passed: anyone may end the match (the waited-for side loses) */
	timedOut: boolean;
	won: boolean;
	lost: boolean;
	secondsLeft: number;
};

export function roleIn(
	match: MatchSummary,
	player: string | undefined,
	nowSeconds: number,
): MatchRole {
	const seat = player
		? match.seats.findIndex(
				(s) => s.player.toLowerCase() === player.toLowerCase(),
			)
		: -1;
	const mine = seat >= 0 ? seat : undefined;
	const active = match.status === 'Active';
	const awaitingMe = mine !== undefined && (match.awaiting & (1 << mine)) !== 0;
	const myTurn = active && mine === match.turnSeat && match.awaiting === 0;
	const timedOut = active && nowSeconds > match.deadline;
	return {
		seat: mine,
		canJoin:
			match.status === 'Open' && player !== undefined && mine === undefined,
		canCancel: match.status === 'Open' && mine === 0,
		myTurn: myTurn && !timedOut,
		mustAnswer: active && awaitingMe && !timedOut,
		waitingForAnswer: active && mine === match.turnSeat && match.awaiting !== 0,
		timedOut,
		won: match.status === 'Finished' && mine === match.winner,
		lost:
			match.status === 'Finished' &&
			mine !== undefined &&
			mine !== match.winner,
		secondsLeft: Math.max(0, match.deadline - nowSeconds),
	};
}

/** Positions of the ring's cells, for an SVG of `size` pixels. */
export function ringLayout(
	cells: number,
	size: number,
): {cell: number; x: number; y: number}[] {
	const r = size * 0.38;
	return Array.from({length: cells}, (_, cell) => {
		const angle = (cell / cells) * 2 * Math.PI - Math.PI / 2;
		return {
			cell,
			x: size / 2 + r * Math.cos(angle),
			y: size / 2 + r * Math.sin(angle),
		};
	});
}
