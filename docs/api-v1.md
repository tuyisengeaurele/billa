# Billa API v1

Read and create customers, items and documents from another system.

## Authentication

Create a key under Settings, API access. Only the business owner can. The full key is shown once, so copy it then.

Send it on every request:

```
Authorization: Bearer bla_live_...
```

A key belongs to one business and acts as its owner. Revoke it from the same page and it stops working at once. There are at most 10 active keys per business.

Requests are limited to 120 per minute per key.

## Errors

Errors are JSON with an `error` code.

| Status | Meaning |
| --- | --- |
| 400 | The body failed validation. `details` lists what was wrong. |
| 401 | `invalid_api_key`: the key is missing, wrong or revoked. |
| 402 | `subscription_required`: the trial or subscription has ended. Reads still work, writes do not. |
| 404 | `not_found`: no such record, or the endpoint is not part of the API. |
| 409 | The action conflicts with the record's state, for example editing a finalized document. |

## Customers

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/v1/customers` | List customers. Query: `search`, `page`, `pageSize` (max 100), `includeInactive`. |
| GET | `/api/v1/customers/:id` | One customer. |
| POST | `/api/v1/customers` | Create a customer. |
| PATCH | `/api/v1/customers/:id` | Change a customer. |

```json
{ "name": "Acme Ltd", "phone": "0788123456", "email": "accounts@acme.rw", "tin": "123456789", "address": "KG 7 Ave, Kigali" }
```

Only `name` is required.

## Items

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/v1/items` | List items. Query: `search`, `category`, `page`, `pageSize`, `includeInactive`. |
| POST | `/api/v1/items` | Create an item. |
| PATCH | `/api/v1/items/:id` | Change an item. |

```json
{ "description": "Cement 50kg", "unitPrice": 12500, "unit": "bag", "taxRate": 18, "category": "Building" }
```

Prices are whole Rwandan francs.

## Documents

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/v1/documents` | List documents. Query: `type`, `status`, `search`, `page`, `pageSize`. |
| GET | `/api/v1/documents/:id` | One document with its lines. |
| POST | `/api/v1/documents` | Create a draft. |
| PATCH | `/api/v1/documents/:id` | Change a draft. |
| POST | `/api/v1/documents/:id/finalize` | Give a draft its number and lock it. |
| POST | `/api/v1/documents/:id/payments` | Record a payment against a finalized invoice. |
| GET | `/api/v1/documents/:id/pdf` | Download the PDF. |

```json
{
  "type": "INVOICE",
  "customerId": "cl...",
  "issueDate": "2026-09-01",
  "dueDate": "2026-10-01",
  "lines": [{ "description": "Cement 50kg", "quantity": 2, "unitPrice": 12500, "taxRate": 18 }]
}
```

`type` is one of `INVOICE`, `PROFORMA`, `DELIVERY_NOTE`, `QUOTE`, `RECEIPT`, `CREDIT_NOTE`. Totals are worked out by the server, never sent.

A payment:

```json
{ "amount": 5000, "method": "BANK_TRANSFER", "paidOn": "2026-09-02", "referenceNumber": "TX-1029" }
```

`method` is one of `CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`, `CHEQUE`, `OTHER`. The amount cannot be more than what is still owed.

## Example

```bash
curl -H "Authorization: Bearer $BILLA_KEY" \
  "https://your-billa-host/api/v1/customers?search=acme"
```

## What is not in the API

Deleting records, write-offs, imports and exports, business settings, team and billing are only in the app.
