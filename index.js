/* FleetFlowSDK – OAuth + cookies (web) and manual Bearer (backend)
	 2025-08-18
	 ------------------------------------------------
	 • Web/Next.js: use OAuth + HttpOnly cookies; fetch includes cookies
	 • Backend/Node: set a Bearer token via setToken()
	 • No tokens stored/read from localStorage
*/

class FleetFlowSDK {
	constructor(baseURL = "fleetflow.io", headers = {}) {
		this.baseURL = baseURL;

		this.headers = {
			"Content-Type": "application/json",
			...headers,
		};

		// Backend-only manual Bearer
		this.token = null;

		// Refresh state
		this.refreshInProgress = false;
		this.refreshPromise = null;

		// Runtime detection
		this.isBrowser = typeof window !== "undefined";

		// OAuth configuration (can be overridden via setOAuthConfig)
		this.oauth = {
			enabled: false,
			clientId: null,
			redirectUri: null,
			scopes: ["openid", "profile", "email"],
			// Endpoints at the auth app
			authorizationEndpoint: null, // defaults to `${authBase}/oauth/authorize`
			tokenEndpoint: null, // defaults to `${authBase}/oauth/token`
			// Your app-local routes (Next.js) used in web mode
			loginRoute: "/api/auth/login",
			callbackRoute: "/api/auth/callback",
			refreshRoute: "/api/auth/refresh",
			logoutRoute: "/api/auth/logout",
			refreshMethod: "POST", // "GET" or "POST"
		};

		return this.createProxy();
	}

	/* ───────────────────────────── Helpers ───────────────────────────── */

	isIPAddress(str) {
		const parts = (str || "").split(".");
		return (
			parts.length === 4 &&
			parts.every((p) => {
				const n = +p;
				return n >= 0 && n <= 255 && !Number.isNaN(n);
			})
		);
	}

	getLocalhostUrl(api) {
		const ports = {
			platform: "3001",
			organization: "3002",
			customer: "3003",
			orchestrator: "3004",
			partner: "3005",
			admin: "3007",
		};
		const port = ports[api];
		if (!port) throw new Error(`Unknown API: ${api}`);

		if (this.baseURL === "localhost")
			return `http://localhost:${port}`;
		if (this.isIPAddress(this.baseURL))
			return `http://${this.baseURL}:${port}`;
		return `http://localhost:${port}`;
	}

	buildApiRoot(api) {
		if (this.baseURL === "localhost" || this.isIPAddress(this.baseURL)) {
			return this.getLocalhostUrl(api);
		}
		return `https://${api}-api.${this.baseURL}`;
	}

	getAuthBaseURL() {
		if (this.baseURL === "localhost" || this.isIPAddress(this.baseURL)) {
			return "http://localhost:3104";
		}
		return `https://auth.${this.baseURL}`;
	}

	/* ───────────────────────────── Public setters ───────────────────────────── */

	setToken(token) {
		// Backend-only: manual Bearer
		this.token = token;
	}

	unsetToken() {
		this.token = null;
	}

	setApiKey(apiKey) {
		this.headers["X-Api-Key"] = apiKey;
	}

	setOAuthConfig(config = {}) {
		const authBase = this.getAuthBaseURL();
		this.oauth = {
			...this.oauth,
			...config,
		};

		if (!this.oauth.authorizationEndpoint) {
			this.oauth.authorizationEndpoint = `${authBase}/oauth/authorize`;
		}
		if (!this.oauth.tokenEndpoint) {
			this.oauth.tokenEndpoint = `${authBase}/oauth/token`;
		}
		this.oauth.enabled = true;
	}

	disableOAuth() {
		this.oauth.enabled = false;
	}

	/* ───────────────────────────── OAuth helpers ───────────────────────────── */

	// Generate PKCE verifier and challenge
	async generatePkcePair() {
		const randomBytes =
			(globalThis.crypto &&
				globalThis.crypto.getRandomValues &&
				new Uint8Array(32)) ||
			null;

		if (randomBytes) {
			globalThis.crypto.getRandomValues(randomBytes);
		} else {
			// Node fallback
			const { randomBytes: rb } = await import("crypto");
			const buf = rb(32);
			const arr = new Uint8Array(buf);
			for (let i = 0; i < 32; i++) randomBytes[i] = arr[i];
		}

		const verifier = this.base64UrlEncode(randomBytes);
		const challenge = await this.sha256Base64Url(verifier);
		return { verifier, challenge };
	}

	base64UrlEncode(bytes) {
		let str = "";
		for (let i = 0; i < bytes.length; i++) {
			str += String.fromCharCode(bytes[i]);
		}
		const b64 =
			typeof btoa === "function"
				? btoa(str)
				: Buffer.from(str, "binary").toString("base64");
		return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}

	async sha256Base64Url(input) {
		const encoder = new TextEncoder();
		const data = encoder.encode(input);

		if (globalThis.crypto && globalThis.crypto.subtle) {
			const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
			return this.base64UrlEncode(new Uint8Array(digest));
		} else {
			const { createHash } = await import("crypto");
			const hash = createHash("sha256").update(Buffer.from(data)).digest();
			return this.base64UrlEncode(new Uint8Array(hash));
		}
	}

	buildOAuthAuthorizeUrl({
		clientId,
		redirectUri,
		scope,
		codeChallenge,
		state,
		extraParams = {},
	}) {
		const endpoint = this.oauth.authorizationEndpoint || this.getAuthBaseURL();
		const params = new URLSearchParams({
			response_type: "code",
			client_id: clientId || this.oauth.clientId,
			redirect_uri: redirectUri || this.oauth.redirectUri,
			scope: Array.isArray(scope) ? scope.join(" ") : scope ? scope : this.oauth.scopes.join(" "),
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			state: state || "",
		});

		for (const [k, v] of Object.entries(extraParams || {})) {
			if (v !== undefined && v !== null) params.append(k, String(v));
		}

		return `${endpoint}?${params.toString()}`;
	}

	// Server-side: exchange authorization code for tokens at the auth app
	async oauthExchangeCode({
		code,
		codeVerifier,
		redirectUri,
		clientId,
	}) {
		const tokenEndpoint =
			this.oauth.tokenEndpoint || `${this.getAuthBaseURL()}/oauth/token`;

		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			code_verifier: codeVerifier,
			redirect_uri: redirectUri || this.oauth.redirectUri,
			client_id: clientId || this.oauth.clientId,
		});

		const res = await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body,
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(
				`Token exchange failed (${res.status}): ${text || "unknown"}`
			);
		}

		return res.json();
	}

	// Server-side: refresh tokens at the auth app
	async oauthRefreshWithToken({ refreshToken, clientId }) {
		const tokenEndpoint =
			this.oauth.tokenEndpoint || `${this.getAuthBaseURL()}/oauth/token`;

		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId || this.oauth.clientId,
		});

		const res = await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body,
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(
				`Refresh failed (${res.status}): ${text || "unknown"}`
			);
		}

		return res.json();
	}

	/* ───────────────────────────── Request core ───────────────────────────── */

	async request(api, version, method, path, data = {}, extraHeaders = {}) {
		const root = this.buildApiRoot(api);
		const url = `${root}/${version}/${path}`;

		const headers = { ...this.headers, ...extraHeaders };

		// Backend-only Authorization
		if (!this.isBrowser && this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		// Attach data to query string for GET/DELETE
		let query = "";
		if (
			(method === "GET" || method === "DELETE") &&
			data &&
			Object.keys(data).length
		) {
			const qs = Object.entries(data).reduce((acc, [k, v]) => {
				acc[k] = typeof v === "object" ? JSON.stringify(v) : v;
				return acc;
			}, {});
			query = "?" + new URLSearchParams(qs).toString();
		}

		// Body for POST/PATCH
		let body = null;
		if (method !== "GET" && method !== "DELETE") {
			if (data instanceof FormData) {
				body = data;
				delete headers["Content-Type"]; // Let browser set boundary
			} else {
				body = JSON.stringify(data || {});
			}
		}

		const res = await fetch(url + query, {
			method,
			headers,
			body,
			credentials: this.isBrowser ? "include" : "omit",
		});

		// Auto-refresh (401 or 498) and retry once
		if (res.status === 401 || res.status === 498) {
			try {
				await this.handleOAuthRefresh();
				return this.request(
					api,
					version,
					method,
					path,
					data,
					extraHeaders
				);
			} catch (e) {
				// Fallthrough to error parsing below
			}
		}

		const isSuccess = res.status >= 200 && res.status < 300;
		if (res.status === 204) return undefined;

		const text = await res.text();
		let json = null;
		if (text) {
			try {
				json = JSON.parse(text);
			} catch {
				// plain text
			}
		}

		if (!isSuccess) {
			throw new Error(
				(json && (json.message || json.error)) ||
					text ||
					"Request failed"
			);
		}

		// APIs often wrap as { data: ... }
		return json && Object.prototype.hasOwnProperty.call(json, "data")
			? json.data
			: json;
	}

	/* ───────────────────────────── Token refresh ───────────────────────────── */

	async handleOAuthRefresh() {
		if (!this.oauth.enabled) {
			throw new Error("OAuth not enabled; cannot refresh.");
		}

		if (this.refreshInProgress) {
			await this.refreshPromise;
			return;
		}

		this.refreshInProgress = true;
		this.refreshPromise = this.refreshSession();
		try {
			await this.refreshPromise;
		} finally {
			this.refreshInProgress = false;
			this.refreshPromise = null;
		}
	}

	async refreshSession() {
		// Web: call your app-local refresh route so the server can
		// use HttpOnly refresh cookie to get new tokens and set new cookies.
		if (this.isBrowser) {
			const refreshUrl =
				this.oauth.refreshRoute || "/api/auth/refresh";
			const res = await fetch(refreshUrl, {
				method: this.oauth.refreshMethod || "POST",
				credentials: "include",
			});

			if (res.status === 204 || res.status === 200) return;

			throw new Error(
				`Unable to refresh session (status ${res.status})`
			);
		}

		// Backend: you control tokens. If you want auto-refresh in Node,
		// extend the SDK to set a refresh token and refresh here.
		throw new Error(
			"Backend refresh not configured. Manage token rotation in your app."
		);
	}

	/* ───────────────────────────── Dynamic proxy ───────────────────────────── */

	createProxy(path = "") {
		if (path.startsWith("/setToken")) return this.setToken.bind(this);
		if (path.startsWith("/unsetToken")) return this.unsetToken.bind(this);
		if (path.startsWith("/setApiKey")) return this.setApiKey.bind(this);
		if (path.startsWith("/setUserType")) return this.setUserType.bind(this);
		if (path.startsWith("/setOAuthConfig"))
			return this.setOAuthConfig.bind(this);
		if (path.startsWith("/disableOAuth"))
			return this.disableOAuth.bind(this);

		return new Proxy(() => {}, {
			get: (target, prop) => {
				if (path === "" && typeof this[prop] === "function") {
					return this[prop].bind(this);
				}
				if (path === "" && prop in this) {
					return this[prop];
				}

				if (["get", "post", "patch", "delete"].includes(prop)) {
					return async (data) => {
						let api;

						if (path.startsWith("/platform/")) {
							api = "platform";
							path = path.slice(10);
						} else if (path.startsWith("/admin/")) {
							api = "admin";
							path = path.slice(7);
						} else if (path.startsWith("/organization/")) {
							api = "organization";
							path = path.slice(14);
						} else if (path.startsWith("/customer/")) {
							api = "customer";
							path = path.slice(10);
						} else if (path.startsWith("/partner/")) {
							api = "partner";
							path = path.slice(9);
						} else if (path.startsWith("/orchestrator/")) {
							api = "orchestrator";
							path = path.slice(14);
						} else {
							throw new Error(`API not found for path: ${path}`);
						}

						const parts = path.split("/");
						const version = parts.shift();
						const subPath = parts.join("/");

						return this.request(
							api,
							version,
							prop.toUpperCase(),
							subPath,
							data
						);
					};
				}
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