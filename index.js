/* FleetFlowSDK – cookie-based version 2025-05-24
	 ------------------------------------------------
	 • Works in browsers (fetch will include cookies)
	 • Works in Node (pass a Bearer token via setToken)
	 • No tokens are ever stored/read from localStorage
*/

class FleetFlowSDK {
	constructor(baseURL = 'fleetflow.io', headers = {}) {
		this.baseURL = baseURL;

		/** Default headers you can override per-request */
		this.headers = {
			'Content-Type': 'application/json',
			...headers,
		};

		/** Only used in non-browser contexts */
		this.token = null;

		this.refreshInProgress = false;
		this.refreshPromise		= null;

		return this.createProxy();
	}

	/* ───────────────────────────── Helpers ───────────────────────────── */

	isIPAddress(str) {
		const parts = str.split('.');
		return parts.length === 4 && parts.every(p => {
			const n = +p;
			return n >= 0 && n <= 255 && !Number.isNaN(n);
		});
	}

	getLocalhostUrl(api) {
		const ports = {
			platform: 		'3001',
			organization: 	'3002',
			customer:		'3003',
			orchestrator: 	'3004',
			partner:		'3005',
			admin:			'3007',
		};
		const port = ports[api];
		if (!port) throw new Error(`Unknown API: ${api}`);

		if (this.baseURL === 'localhost')			 return `http://localhost:${port}`;
		if (this.isIPAddress(this.baseURL))			 return `http://${this.baseURL}:${port}`;
		/* Fallback (dev): localhost */
		return `http://localhost:${port}`;
	}

	buildApiRoot(api) {
		if (this.baseURL === 'localhost' || this.isIPAddress(this.baseURL)) {
			return this.getLocalhostUrl(api);
		}
		return `https://${api}-api.${this.baseURL}`;
	}

	/* ───────────────────────────── Public setters ───────────────────────────── */

	/** For Node / unit-tests that still want Bearer auth */
	setToken(token) {
		this.token = token;
	}

	unsetToken() {
		this.token = null;
	}

	setApiKey(apiKey) {
		this.headers['X-Api-Key'] = apiKey;
	}

	setUserType(userType) {
		this.headers['X-User-Type'] = userType;
	}

	/* ───────────────────────────── Request core ───────────────────────────── */

	async request(api, version, method, path, data = {}, extraHeaders = {}) {
		const root = this.buildApiRoot(api);
		const url	= `${root}/${version}/${path}`;

		const headers = { ...this.headers, ...extraHeaders };

		/* Basic-auth helper for login-by-credentials endpoints */
		if (method === 'GET' && data.email && data.password) {
			headers.Authorization = `Basic ${btoa(`${data.email}:${data.password}`)}`;
			delete data.email;
			delete data.password;
		} else if (this.token) {
			/* Only used in Node/runtime environments where cookie is absent */
			headers.Authorization = `Bearer ${this.token}`;
		}

		/* Attach data to query string for GET/DELETE */
		let query = '';
		if ((method === 'GET' || method === 'DELETE') && Object.keys(data).length) {
			const qs = Object.entries(data).reduce((acc, [k, v]) => {
				acc[k] = typeof v === 'object' ? JSON.stringify(v) : v;
				return acc;
			}, {});
			query = '?' + new URLSearchParams(qs).toString();
		}

		/* Body for POST/PATCH */
		let body = null;
		if (method !== 'GET' && method !== 'DELETE') {
			if (data instanceof FormData) {
				body = data;
				delete headers['Content-Type'];				// Let browser set boundary
			} else {
				body = JSON.stringify(data);
			}
		}

		const res = await fetch(url + query, {
			method,
			headers,
			body,
			credentials: api !== 'customer' ? 'include' : 'omit'
		});

		/* Auto-refresh if cookie expired (498 = custom, 401 = std) */
		if (res.status === 498) {
			return this.handleTokenRefresh(api, version, method, path, data, extraHeaders);
		}

		// Process response
		const isSuccess = res.status >= 200 && res.status < 300;
		if (res.status === 204) return undefined;

		const text = await res.text();
		let json = null;
		if (text) {
			try { json = JSON.parse(text); } catch {}
		}

		if (!isSuccess) {
			console.error(json || text);
			throw new Error((json && json.message) || text || 'Request failed');
		}

		return json ? json.data : undefined;
	}

	/* ───────────────────────────── Token refresh ───────────────────────────── */

	async handleTokenRefresh(api, version, method, path, data, headers) {
		if (this.refreshInProgress) {
			await this.refreshPromise; // wait for ongoing refresh
		} else {
			this.refreshInProgress = true;
			this.refreshPromise = this.refreshCookie(api, version); // pass version
			try {
				await this.refreshPromise;
			} finally {
				this.refreshInProgress = false;
				this.refreshPromise = null;
			}
		}
		return this.request(api, version, method, path, data, headers);
	}

	async refreshCookie(api, version) {
		/* Decide which API issues refresh; adjust if your architecture differs */
		const refreshApi = ['customer', 'orchestrator'].includes(api) ? 'customer' : 'platform';
		const refreshUrl = `${this.buildApiRoot(refreshApi)}/${version}/auth/refresh`;

		const res = await fetch(refreshUrl, {
			method: 'GET',
			credentials: 'include', // cookie travels both ways
			headers: this.headers,
		});

		/* If backend sets a new cookie, 204 or 200 is fine */
		if (res.status === 204)  {
			return;
		} else if (res.status !== 200) {
			this.unsetToken(); // kill any Node-side token
			throw new Error('Unable to refresh session');
		}
	}

	/* ───────────────────────────── Dynamic proxy (same as before) ───────────────────────────── */

	createProxy(path = '') {
		/* Direct method access shortcuts */
		if (path.startsWith('/setToken'))			return this.setToken.bind(this);
		if (path.startsWith('/unsetToken'))		return this.unsetToken.bind(this);
		if (path.startsWith('/setApiKey'))		 return this.setApiKey.bind(this);
		if (path.startsWith('/setUserType'))	 return this.setUserType.bind(this);

		/* REST verbs */
		return new Proxy(() => {}, {
			get: (target, prop) => {
				if (['get', 'post', 'patch', 'delete'].includes(prop)) {
					return async (data) => {
						let api;

						if		(path.startsWith('/platform/'))		{ api = 'platform';		path = path.slice(10);	}
						else if (path.startsWith('/admin/'))		{ api = 'admin';		path = path.slice(7);	}
						else if (path.startsWith('/organization/')) { api = 'organization'; path = path.slice(14);	}
						else if (path.startsWith('/customer/'))		{ api = 'customer';		path = path.slice(10);	}
						else if (path.startsWith('/partner/'))		{ api = 'partner';		path = path.slice(9); 	}
						else if (path.startsWith('/orchestrator/')) { api = 'orchestrator'; path = path.slice(14);	}
						else {
							throw new Error(`API not found for path: ${path}`);
						}

						const parts	 = path.split('/');
						const version = parts.shift();
						const subPath = parts.join('/');

						return this.request(api, version, prop.toUpperCase(), subPath, data);
					};
				}
				/* Recursively build path */
				return this.createProxy(`${path}/${prop}`);
			},
			apply: (target, thisArg, args) => {
				const [uuid] = args;
				return this.createProxy(uuid ? `${path}/${uuid}` : path);
			},
		});
	}
}

export default FleetFlowSDK;
