class MoneybirdSDK {
    constructor(token, administrationId, headers = {}) {
        this.token = token;
        this.administrationId = administrationId;
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...headers,
        };
        
        return this.createProxy();
    }

    async request(path, method, data = {}, options = {}) {
        const baseUrl = `https://moneybird.com/api/v2/${this.administrationId}`;
        let fullPath = path;

        // Handle GET requests with parameters
        let queryParams = '';
        if (method === 'GET' && Object.keys(data).length > 0) {
            const serializedData = Object.keys(data).reduce((acc, key) => {
                acc[key] = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
                return acc;
            }, {});
            queryParams = '?' + new URLSearchParams(serializedData).toString();
        }

        // Handle pagination if get_all is true
        if (method === 'GET' && options.get_all) {
            let allResults = [];
            let page = 1;
            
            while (true) {
                const pageParams = queryParams ? 
                    `${queryParams}&page=${page}&per_page=100` : 
                    `?page=${page}&per_page=100`;
                
                const response = await fetch(`${baseUrl}/${fullPath}.json${pageParams}`, {
                    method,
                    headers: this.headers,
                });

                if (!response.ok) {
                    throw new Error(`Moneybird API error: ${response.status} ${response.statusText}: ${await response.text()}`);
                }

                const results = await response.json();
                
                if (!results || results.length === 0) {
                    break;
                }

                allResults = allResults.concat(results);
                page++;
            }

            return allResults;
        }

        // Regular request without pagination
        const response = await fetch(`${baseUrl}/${fullPath}.json${queryParams}`, {
            method,
            headers: this.headers,
            body: method !== 'GET' ? JSON.stringify(data) : null,
        });

        if (!response.ok) {
            throw new Error(`Moneybird API error: ${response.status} ${response.statusText}: ${await response.text()}`);
        }

        return response.json();
    }

    createProxy(path = '') {
        return new Proxy(() => {}, {
            get: (target, prop) => {
                if (['get', 'post', 'patch', 'delete'].includes(prop)) {
                    return async (data = {}, options = {}) => {
                        return this.request(
                            path.substring(1), // Remove leading slash
                            prop.toUpperCase(),
                            data,
                            options
                        );
                    };
                }

                return this.createProxy(`${path}/${prop}`);
            },
            apply: (target, thisArg, args) => {
                const [id] = args;
                if (!id) {
                    return this.createProxy(path);
                }
                return this.createProxy(`${path}/${id}`);
            }
        });
    }
}

module.exports = MoneybirdSDK;
