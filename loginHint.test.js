// eslint-disable-next-line import/no-unresolved
import { describe, expect, test } from 'bun:test';

import { buildInvitationUrl, normalizeLoginHint } from './loginHint.js';

describe('invitation login hints', () => {
	test('builds an encoded invitation URL', () => {
		expect(buildInvitationUrl('https://app.fleetflow.io', 'quinten+invitation@ademagroup.com')).toBe(
			'https://app.fleetflow.io/invitation?email=quinten%2Binvitation%40ademagroup.com'
		);
	});

	test('normalizes safe email hints and rejects invalid values', () => {
		expect(normalizeLoginHint('  quinten@ademagroup.com ')).toBe('quinten@ademagroup.com');
		expect(normalizeLoginHint(['quinten@ademagroup.com'])).toBe('quinten@ademagroup.com');
		expect(normalizeLoginHint('not-an-email')).toBe('');
		expect(normalizeLoginHint('attacker@example.com\r\nX-Test: injected')).toBe('');
	});
});
