const normalizeLoginHint = (value) => {
	const candidate = Array.isArray(value) ? value[0] : value;
	if (typeof candidate !== 'string') return '';

	const email = candidate.trim();
	if (email.length === 0 || email.length > 254) return '';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
	return email;
};

const buildInvitationUrl = (appOrigin, email) => {
	const loginHint = normalizeLoginHint(email);
	if (!loginHint) throw new Error('A valid invitation email is required');

	const invitationUrl = new URL('/invitation', appOrigin);
	invitationUrl.searchParams.set('email', loginHint);
	return invitationUrl.toString();
};

export {
	buildInvitationUrl,
	normalizeLoginHint,
};
