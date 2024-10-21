
# FleetFlow JavaScript SDK

The **FleetFlow JavaScript SDK** provides an easy way to interact with the FleetFlow API, allowing you to perform CRUD operations on resources using a dynamic and flexible interface.


## Benefits of using the SDK

The SDK is designed to make your life easier, and help us understand your interactions with FleetFlow better. We strongly advice to use the SDK whenever you can. Below are som benefits of using the SDK.

- **Secure authentication** helps you not make mistakes during authenticating by securely handling tokens.

- **Automatic refresh tokens** make it so you do not have to handle refresh tokens yourself. The SDK automatically takes care of that part for you.

## Installation

To install the SDK, simply include the following in your project:

```bash
npm install https://github.com/FleetFlow/platform/packages/js-sdk
```

## Usage

### Choosing your API

Choose which API you want to use.

- Use the `platform-api` for interacting with platform accounts.

- Use the `organization-api` for interacting with your organization.

- Use the `partner-api` for partners interacting with organizations.

- Use the `customer-api` for customers to interact with the organization.

- Use the `orchestator-api` for custom integrations provided by the FleetFlow team.

### Initialize the SDK

To initialize the SDK, create a new instance by providing the base URL of your FleetFlow API:

```javascript
const fleetFlow = new FleetFlowSDK();
```

Or, in case you are given a custom installation, enter your base url.

```javascript
const fleetFlow = new FleetFlowSDK(`custom-deployment.com`);
```

Optionally, you can also pass headers that will be used with every request.

```javascript
const fleetFlow = new FleetFlowSDK('fleetflow.io', {
	'X-Api-Key': '1b06abdb-6bcb-438c-b9fd-cb9d7e451a71',
	'X-User-Type': 'fleetflow'
});
```

Now, you can use `fleetFlow` to interact with your API.

### HTTP Methods

The SDK supports the following HTTP methods:

- **get()**: Retrieve data from the API.
- **post(data)**: Send data to create a new resource.
- **patch(data)**: Update an existing resource with partial data.
- **delete()**: Remove a resource from the API.

### Example usage

The SDK provides a flexible way to chain methods, allowing you to interact with any endpoint dynamically. Below are some example commands you can use.

#### Authenticate platform user

```javascript
const fleetFlow = new FleetFlowSDK();

const auth = await fleetFlow.platform('v1').auth().get({
	email: 'john@doe.com',
	password: '******'
});

// Automatically uses stored token
const users = await fleetFlow.organization('v1').users().get();
```

#### Authenticate customer

```javascript
const fleetFlow = new FleetFlowSDK('fleetflow.io', {
	'X-Api-Key': '{organization.api_key}',
	'X-User-Type': 'fleetflow'
});

const auth = await fleetFlow.customer('v3').auth().get({
	email: 'john@doe.com',
	password: '******'
});

// Automatically uses stored token
const vehicles = await fleetFlowCustomer.vehicles().get();
```

#### Interact with resources
Get, create, update or delete objects with chained commands.

```javascript
// Get all articles
const articles = await fleetFlow.organization('v1').articles().get();

// Get a specific article
const article = await fleetFlow.organization('v1').articles('article_uuid').get();

// Create a new article
const newArticle = await fleetFlow.organization('v1').articles().post({
	title: 'New article',
	text: 'Hello world!'
});

// Update an article
const updatedArticle = await fleetFlow.organization('v1').articles('article_uuid').patch({
	title: 'Updated article'
});

// Delete an article
await fleetFlow.organization('v1').articles('article_uuid').delete();
```

#### Nested resources
You can chain commands to get further details. See the examples below.

```javascript
// Get all reviews for an article
const reviews = await fleetFlow.organization('v1').articles('article_uuid').reviews().get();

// Get a specific review for an article
const review = await fleetFlow.organization('v1').articles('article_uuid').reviews('review_uuid').get();

// Create a review for an article
const newReview = await fleetFlow.organization('v1').articles('article_uuid').reviews().post({
	stars: 5,
	text: 'Great article!'
});

// Update a review for an article
const updatedReview = await fleetFlow.organization('v1').articles('article_uuid').reviews('review_uuid').patch({
	stars: 4
});

// Delete a review for an article
await fleetFlow.organization('v1').articles('article_uuid').reviews('review_uuid').delete();
```

## Error Handling

The SDK will throw an error if the API response is not 200 OK. Make sure to handle errors in your application.

```javascript
try {
	const article = await fleetFlow.organization('v1').articles('invalid_uuid').get();
} catch (error) {
	console.error('Error fetching article:', error.message);
}
```