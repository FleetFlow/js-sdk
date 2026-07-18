import { describe, expect, test } from 'bun:test';

import {
	OAuthTokenExchangeError,
	buildOAuthRestartUrl,
	isRecoverableOAuthCallbackError,
} from './index.js';

describe('OAuth callback recovery', () => {
	test('preserves safe in-app redirects when restarting sign-in', () => {
		expect(buildOAuthRestartUrl('/orders/123?tab=details')).toBe(
			'/api/auth/login?redirect_to=%2Forders%2F123%3Ftab%3Ddetails'
		);
		expect(buildOAuthRestartUrl('//malicious.example')).toBe(
			'/api/auth/login?redirect_to=%2F'
		);
	});

	test('restarts only recoverable OAuth token errors', () => {
		expect(isRecoverableOAuthCallbackError(
			new OAuthTokenExchangeError(400, { error: 'invalid_grant' })
		)).toBe(true);
		expect(isRecoverableOAuthCallbackError(
			new OAuthTokenExchangeError(500, { error: 'server_error' })
		)).toBe(false);
		expect(isRecoverableOAuthCallbackError(new Error('Network unavailable'))).toBe(false);
	});
});
