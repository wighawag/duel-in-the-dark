import type {Activity} from './game';

/**
 * What to tell the player about the action in progress, or the one that just
 * ended. Undefined: nothing worth a line (idle, or the player backed out
 * themselves, by rejecting in the wallet or dismissing a dialog).
 *
 * Shown next to the button that started the action, so it cannot be scrolled
 * out of sight: the page used to print it above the ship, and a player
 * clicking "Create" at the bottom saw nothing happen at all.
 */
export type ActivityLine = {
	tone: 'busy' | 'ok' | 'error';
	text: string;
};

export function activityLine(activity: Activity): ActivityLine | undefined {
	switch (activity.step) {
		case 'idle':
			return undefined;
		case 'proving':
			return {
				tone: 'busy',
				text: `${activity.action}: proving (this can take a few seconds)…`,
			};
		case 'sending':
			return {tone: 'busy', text: `${activity.action}: sending…`};
		case 'failed':
			return {
				tone: 'error',
				text: `${activity.action} failed: ${activity.message}`,
			};
		case 'done': {
			const {result} = activity;
			switch (result.status) {
				case 'submitted':
					return {
						tone: 'ok',
						text: `${activity.action}: sent, waiting for it to be included.`,
					};
				case 'cancelled':
					return undefined;
				case 'cannot-send':
					return {
						tone: 'error',
						text: `${activity.action}: this account has no wallet to send with. Connect with a wallet instead.`,
					};
				case 'error':
					return {
						tone: 'error',
						text: `${activity.action} failed: ${result.message}`,
					};
			}
		}
	}
}
