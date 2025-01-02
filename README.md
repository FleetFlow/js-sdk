# Moneybird JavaScript SDK

The **Moneybird JavaScript SDK** provides a simple way to interact with the Moneybird API, allowing you to perform CRUD operations on resources using a dynamic and flexible interface.

## Installation

To install the SDK, add it to your project:

```bash
npm install https://github.com/quintenadema/moneybird-js
```

## Usage

### Initialize the SDK

Create a new instance by providing your Moneybird API token and administration ID:

```javascript
const moneybird = new MoneybirdSDK('your-token', 'your-administration-id');
```

Optionally, you can pass additional headers that will be used with every request:

```javascript
const moneybird = new MoneybirdSDK('your-token', 'your-administration-id', {
    'Custom-Header': 'value'
});
```

### HTTP Methods

The SDK supports the following HTTP methods:

- **`get(data?, options?)`**: Retrieve data from the API
- **`post(data)`**: Create a new resource
- **`patch(data)`**: Update an existing resource
- **`delete()`**: Remove a resource

### Example Usage

The SDK uses method chaining to build requests. Here are some examples:

#### Working with Purchase Invoices

```javascript
// Get all contacts (limits to the default pagination size)
const contacts = await moneybird.contacts().get();

// Get all contacts, with a filter
const invoices = await moneybird.contacts().get({
    query: 'Company name'
});

// Get a specific contact
const invoice = await moneybird.contacts('contact_id').get();

// Create a new contact
const newContact = await moneybird.contacts().post({
	company_name: 'Company name'
});

// Update a contact
const updatedContact = await moneybird.contacts('contact_id').patch({
    company_name: 'Super company'
});

// Delete a contact
await moneybird.contactes('contact_id').delete();
```

#### Nested Resources

Chain methods to access nested resources:

```javascript
// Get all details of a purchase invoice
const notes = await moneybird.documents().purchase_invoices('invoice_id').get();

// Add a note to a purchase invoice
const newNote = await moneybird.documents().purchase_invoices('invoice_id').notes().post({
    note: 'Payment pending'
});
```

### Pagination

For GET requests, you can use the `get_all` option to automatically handle pagination:

```javascript
// This will fetch all results across multiple pages
const allInvoices = await moneybird.documents().purchase_invoices().get({}, { get_all: true });
```

### Error Handling

The SDK throws errors for non-200 responses. Always handle errors in your code:

```javascript
try {
    const invoice = await moneybird.documents().purchase_invoices('invalid_id').get();
} catch (error) {
    console.error('Error fetching invoice:', error.message);
}
```

## API Reference

The SDK dynamically maps to the Moneybird API endpoints. Refer to the [Moneybird API documentation](https://developer.moneybird.com/) for a complete list of available endpoints and their parameters.