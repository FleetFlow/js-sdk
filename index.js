class FleetFlowSDK {
	constructor(baseURL = 'fleetflow.io', headers = {}) {
		this.baseURL = baseURL;
		this.headers = {
			'Content-Type': 'application/json',
			...headers,
		};
		this.token = null;
		this.refresh_token = null;
		this.refreshInProgress = false;  // New flag for locking
		this.refreshPromise = null;  // New promise for queued requests

		// Automatically return a Proxy on instantiation
		return this.createProxy();
	}

	setToken(token, refresh_token) {
		if (token) {
			this.token = token;
		}
		if (refresh_token) {
			this.refresh_token = refresh_token;
		}


		if (typeof window !== 'undefined' && window.localStorage.profileData) {
			window.localStorage.profileData = JSON.stringify({
				...JSON.parse(window.localStorage.profileData),
				token: this.token,
				refresh_token: this.refresh_token,
			});
		}
	}
	unsetToken() {
		console.log('Unsetting token');
		this.token = null;
		this.refresh_token = null;

		if (typeof window !== 'undefined' && window.localStorage.profileData) {
			window.localStorage.profileData = JSON.stringify({
				...JSON.parse(window.localStorage.profileData),
				token: null,
				refresh_token: null,
			});
		}
	}

	setApiKey(api_key) {
		this.headers['X-Api-Key'] = api_key;
	}

	setUserType(user_type) {
		this.headers['X-User-Type'] = user_type;
	}

	getLocalhostUrl(api) {
		switch (api) {
			case 'platform':
				return 'http://localhost:3001';
			case 'organization':
				return 'http://localhost:3002';
			case 'customer':
				return 'http://localhost:3003';
			case 'orchestrator':
				return 'http://localhost:3004';
			case 'partner':
				return 'http://localhost:3005';
			case 'admin':
				return 'http://localhost:3007';
			default:
				throw new Error(`Unknown API: ${api}`);
		}
	}

	// Generic request handler with empty response handling
	async request(api, version, method, path, data = {}, headers = {}) {
		let auth_type;

		let url;
		if (this.baseURL == 'localhost') {
			// Localhost URL logic as before
			url = this.getLocalhostUrl(api);
		} else {
			url = `https://${api}-api.${this.baseURL}`;
		}

		let processed_data = data;
		if (method === 'GET' && data.email && data.password) {
			headers['Authorization'] = `Basic ${btoa(`${data.email}:${data.password}`)}`;
			auth_type = 'basic';
			delete processed_data.email;
			delete processed_data.password;
		} else if (this.token) {
			headers['Authorization'] = `Bearer ${this.token}`;
			auth_type = 'bearer';
		}

		let getData = '';
		if (method === 'GET' && Object.keys(data).length > 0) {
			const serializedData = Object.keys(data).reduce((acc, key) => {
				acc[key] = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
				return acc;
			}, {});
		
			getData = '?' + new URLSearchParams(serializedData).toString();
		}

		// Send the request
		const response = await fetch(`${url}/${version}/${path}${getData}`, {
			method,
			headers: {
				...this.headers,
				...headers,
			},
			body: method !== 'GET' ? JSON.stringify(processed_data) : null,
		});

		const response_body = await response.json();

		if (response.status == 498) {
			return this.handleTokenRefresh(api, version, method, path, data, headers);
		}

		if (response.status !== 200) {
			throw new Error(response_body.message);
		}

		if (method === 'GET' && path == 'auth') {
			
			if (typeof window !== 'undefined') {
				window.localStorage.profileData = JSON.stringify(response_body.data);
			}

			if (response_body.data.token) {
				this.setToken(response_body.data.token, response_body.data.refresh_token);
			}

		}

		return response_body.data;
	}

	// Handle token refresh with a promise-based lock
	async handleTokenRefresh(api, version, method, path, data, headers) {
		if (this.refreshInProgress) {
			// Wait for the refresh to finish and then retry the request
			await this.refreshPromise;
		} else {
			// Refresh the token
			this.refreshInProgress = true;
			this.refreshPromise = this.refreshToken(api);

			try {
				await this.refreshPromise;
			} finally {
				this.refreshInProgress = false;
				this.refreshPromise = null;
			}
		}

		// Retry the original request after refreshing the token
		return this.request(api, version, method, path, data, headers);
	}

	// Actual refresh token request logic
	async refreshToken(api) {
		let refresh_url;
		if (['customer', 'orchestrator'].includes(api)) {
			refresh_url = this.baseURL == 'localhost' 
				? `http://localhost:3003/v1/auth/refresh` 
				: `https://customer-api.${this.baseURL}/v3/auth/refresh`;
		} else {
			refresh_url = this.baseURL == 'localhost' 
				? `http://localhost:3001/v1/auth/refresh` 
				: `https://platform-api.${this.baseURL}/v1/auth/refresh`;
		}

		const refresh_response = await fetch(refresh_url, {
			method: 'GET',
			headers: {
				...this.headers,
				Authorization: `Bearer ${this.refresh_token}`,
			},
		});

		if (refresh_response.status !== 200) {
			throw new Error('Unable to refresh token');
		}

		const refresh_response_body = await refresh_response.json();
		this.setToken(refresh_response_body.data.token, refresh_response_body.data.refresh_token);
	}

	// Recursive proxy generator
	createProxy(path = '') {
		if (path.startsWith('/setToken')) {
			return this.setToken.bind(this);
		} else if (path.startsWith('/unsetToken')) {
			return this.unsetToken.bind(this);
		} else if (path.startsWith('/setApiKey')) {
			return this.setApiKey.bind(this);
		} else if (path.startsWith('/setUserType')) {
			return this.setUserType.bind(this);
		}

		return new Proxy(() => {}, {
			get: (target, prop) => {
				if (['get', 'post', 'patch', 'delete'].includes(prop)) {
					return async (data) => {
						let api;
						if (path.startsWith('/platform/')) {
							api = 'platform';
							path = path.substr('/platform/'.length);
						} else if (path.startsWith('/admin/')) {
							api = 'admin';
							path = path.substr('/admin/'.length);
						} else if (path.startsWith('/organization/')) {
							api = 'organization';
							path = path.substr('/organization/'.length);
						} else if (path.startsWith('/customer/')) {
							api = 'customer';
							path = path.substr('/customer/'.length);
						} else if (path.startsWith('/partner/')) {
							api = 'partner';
							path = path.substr('/partner/'.length);
						} else if (path.startsWith('/orchestrator/')) {
							api = 'orchestrator';
							path = path.substr('/orchestrator/'.length);
						} else {
							throw new Error("API not found");
						}

						const split_path = path.split('/');
						const version = split_path[0];
						split_path.shift();
						path = split_path.join('/');

						return this.request(api, version, prop.toUpperCase(), path, data);
					};
				}

				// Extend the path for further chaining
				return this.createProxy(`${path}/${prop}`);
			},
			apply: (target, thisArg, args) => {
				const [uuid] = args;
				if (!uuid) {
					return this.createProxy(path);
				}
				return this.createProxy(`${path}/${uuid}`);
			}
		});
	}
}

export default FleetFlowSDK;
