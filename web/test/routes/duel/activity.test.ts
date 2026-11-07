import {describe, it, expect} from 'vitest';
import {activityLine} from '../../../src/routes/duel/lib/activity';

const action = 'Create a match';

describe('activityLine', () => {
	it('says nothing when idle, or when the player backed out', () => {
		expect(activityLine({step: 'idle'})).toBeUndefined();
		expect(
			activityLine({step: 'done', action, result: {status: 'cancelled'}}),
		).toBeUndefined();
	});

	it('shows progress while proving and sending', () => {
		expect(activityLine({step: 'proving', action})?.tone).toBe('busy');
		expect(activityLine({step: 'sending', action})).toEqual({
			tone: 'busy',
			text: 'Create a match: sending…',
		});
	});

	it('confirms a submitted transaction instead of going silent', () => {
		expect(
			activityLine({
				step: 'done',
				action,
				result: {status: 'submitted', hash: '0x01'},
			}),
		).toEqual({
			tone: 'ok',
			text: 'Create a match: sent, waiting for it to be included.',
		});
	});

	it('reports an account that cannot send, and every failure', () => {
		expect(
			activityLine({step: 'done', action, result: {status: 'cannot-send'}})
				?.tone,
		).toBe('error');
		expect(
			activityLine({
				step: 'done',
				action,
				result: {status: 'error', message: 'reverted', details: ''},
			}),
		).toEqual({tone: 'error', text: 'Create a match failed: reverted'});
		expect(activityLine({step: 'failed', action, message: 'boom'})).toEqual({
			tone: 'error',
			text: 'Create a match failed: boom',
		});
	});
});
