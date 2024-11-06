class FleetFlowSDK {
    constructor(baseURL = 'fleetflow.io', headers = {}) {
        this.baseURL = baseURL;
        this.headers = {
            'Content-Type': 'application/json',
            ...headers,
        };
        this.token = null;
        this.refresh_token = null;
        this.refreshInProgress = false;
        this.refreshPromise = null;

        if (typeof window !== 'undefined' && window.localStorage.tokens) {
            const tokens = JSON.parse(window.localStorage.tokens);
            this.token = tokens.token;
            this.refresh_token = tokens.refresh_token;
        }

        return this.createProxy();
    }

    async refreshProfile() {
        const api = window.localStorage.tokenApi;
        const version = window.localStorage.tokenApiVersion;

        // Use the internal request method to fetch account data
        const account_body = await this.request(api, version, 'GET', 'account');
        window.localStorage.profileData = JSON.stringify(account_body);

        // For customer API, also fetch vehicles data
        if (api === 'customer') {
            const vehicles_body = await this.request(api, version, 'GET', 'vehicles');
            window.localStorage.vehiclesData = JSON.stringify(vehicles_body);
        }
    }

    // Rest of the class methods remain the same
    setToken(token, refresh_token) {
        if (token) {
            this.token = token;
        }
        if (refresh_token) {
            this.refresh_token = refresh_token;
        }

        if (typeof window !== 'undefined') {
            window.localStorage.tokens = JSON.stringify({
                token: this.token,
                refresh_token: this.refresh_token,
            });
        }
    }

    unsetToken() {
        this.token = null;
        this.refresh_token = null;

        if (typeof window !== 'undefined') {
            delete window.localStorage.profileData;
            delete window.localStorage.tokens;
            delete window.localStorage.tokenApi;
            delete window.localStorage.tokenApiVersion;
        }
    }

    setApiKey(api_key) {
        this.headers['X-Api-Key'] = api_key;
    }

    setUserType(user_type) {
        this.headers['X-User-Type'] = user_type;
    }

    isIPAddress(string) {
        const components = string.split('.');
        if (components.length !== 4) return false;

        return components.every(component => {
            const number = parseInt(component, 10);
            return number >= 0 && number <= 255 && !isNaN(number);
        });
    }

    getLocalhostUrl(api) {
        let port;
        switch (api) {
            case 'platform':
                port = '3001';
                break;
            case 'organization':
                port = '3002';
                break;
            case 'customer':
                port = '3003';
                break;
            case 'orchestrator':
                port = '3004';
                break;
            case 'partner':
                port = '3005';
                break;
            case 'admin':
                port = '3007';
                break;
            default:
                throw new Error(`Unknown API: ${api}`);
        }
        
        if (this.baseURL === 'localhost') {
            return `http://localhost:${port}`;
        } else if (this.isIPAddress(this.baseURL)) {
            return `http://${this.baseURL}:${port}`;
        } else {
            return `http://localhost:${port}`;
        }
    }

    async request(api, version, method, path, data = {}, headers = {}) {
        let url;
        if (this.baseURL === 'localhost' || this.isIPAddress(this.baseURL)) {
            url = this.getLocalhostUrl(api);
        } else {
            url = `https://${api}-api.${this.baseURL}`;
        }

        let processed_data = data;
        if (method === 'GET' && data.email && data.password) {
            headers['Authorization'] = `Basic ${btoa(`${data.email}:${data.password}`)}`;
            delete processed_data.email;
            delete processed_data.password;
        } else if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        let getData = '';
        if (method === 'GET' && Object.keys(data).length > 0) {
            const serializedData = Object.keys(data).reduce((acc, key) => {
                acc[key] = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
                return acc;
            }, {});
        
            getData = '?' + new URLSearchParams(serializedData).toString();
        }

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
            console.log(response_body);
            throw new Error(response_body.message);
        }

        if (
            (method === 'GET' && path == 'auth') ||
            (method === 'POST' && path == 'auth/magic/email') ||
            (method === 'POST' && path == 'auth/magic/phone')
        ) {
            this.setToken(response_body.data.token, response_body.data.refresh_token);

            if (typeof window !== 'undefined') {
                window.localStorage.tokenApi = api;
                window.localStorage.tokenApiVersion = version;
                
                await this.refreshProfile();
            }
        }

        return response_body.data;
    }

    async handleTokenRefresh(api, version, method, path, data, headers) {
        if (this.refreshInProgress) {
            await this.refreshPromise;
        } else {
            this.refreshInProgress = true;
            this.refreshPromise = this.refreshToken(api);

            try {
                await this.refreshPromise;
            } finally {
                this.refreshInProgress = false;
                this.refreshPromise = null;
            }
        }

        return this.request(api, version, method, path, data, headers);
    }

    async refreshToken(api) {
        let refresh_url;
        if (['customer', 'orchestrator'].includes(api)) {
            refresh_url = this.baseURL === 'localhost' || this.isIPAddress(this.baseURL)
                ? `${this.getLocalhostUrl('customer')}/v1/auth/refresh`
                : `https://customer-api.${this.baseURL}/v1/auth/refresh`;
        } else {
            refresh_url = this.baseURL === 'localhost' || this.isIPAddress(this.baseURL)
                ? `${this.getLocalhostUrl('platform')}/v1/auth/refresh`
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
			this.unsetToken();
            throw new Error('Unable to refresh token');
        }

        const refresh_response_body = await refresh_response.json();
        this.setToken(refresh_response_body.data.token, refresh_response_body.data.refresh_token);
    }

    createProxy(path = '') {
        if (path.startsWith('/setToken')) {
            return this.setToken.bind(this);
        } else if (path.startsWith('/unsetToken')) {
            return this.unsetToken.bind(this);
        } else if (path.startsWith('/setApiKey')) {
            return this.setApiKey.bind(this);
        } else if (path.startsWith('/setUserType')) {
            return this.setUserType.bind(this);
        } else if (path.startsWith('/refreshProfile')) {
            return this.refreshProfile.bind(this);
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