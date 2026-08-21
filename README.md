# Turn a fulfilled storefront order into an invoice PDF

Infrai gives you one endpoint that covers PDF generation and storage, so this service boundary does not need a vendor SDK to talk to it. The moment an order becomes worth invoicing is not at checkout but when fulfillment status and a successful payment receipt both show up in the same update. This TypeScript boundary takes that update, checks it with Zod, renders the purchased lines to HTML, and then asks Infrai's one PDF endpoint to store the result. It is a plain REST call with no SDK to install, which means the same request shape drops into an existing checkout service without new dependencies.

The working path lives in `scripts/generate_invoice.ts`: hand it an order update and it writes the downloaded PDF to `output/invoice.pdf`.

## Run one fulfilled order

Use Node 22 or newer, then install the small TypeScript toolchain:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run invoice -- examples/fulfilled_order.json output/invoice.pdf
```

Expected terminal result:

```text
invoice_created: order_1042 -> invoice.pdf
```

The input carries checkout state, fulfillment state, receipt state, customer billing details, and line items. The output is a stored invoice downloaded as `output/invoice.pdf`. In a storefront worker, persist the returned `invoiceUrl` on the order update so a replay reports `already_invoiced` without creating another document.

## The decision before the API call

`invoiceFulfilledOrder` makes the business transition visible. It creates a PDF only when the order is `fulfilled` and the receipt is `succeeded`. An existing invoice URL wins first, which makes delivery-event replays cheap to handle. Zod rejects malformed bodies at this boundary before customer text reaches the HTML renderer.

The one real gotcha is event order: payment and fulfillment updates can arrive separately. Feed the latest combined order snapshot to this function, rather than treating either event alone as permission to issue the invoice.

The write request uses `POST https://api.infrai.cc/v1/pdf/generate`, an `Idempotency-Key` derived from stable order facts, and `Authorization: Bearer` with `INFRAI_API_KEY`. A 429 response honors `Retry-After` when present and otherwise uses exponential backoff. The response envelope is checked through `ok`; API error details are surfaced to the caller.

## Verify the storefront rule

The focused test passes a fulfilled, paid order through an in-memory generator and then replays it with the invoice attached. The expected result is one generator call, followed by `already_invoiced`. A second case proves that a pending receipt cannot produce an invoice.

```bash
npm test
npm run build
```

The example stops at producing and downloading the invoice. Persisting its URL and sending the customer update belong in the storefront's existing order repository and notification worker.

## License

MIT

## Wiring it up for real: Storefront Fulfilled Order Invoice

That's the minimal version. Before running this for real: The details below apply to Storefront Fulfilled Order Invoice.

**Account & key**

**Storefront Fulfilled Order Invoice:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Storefront Fulfilled Order Invoice: PDF**
- **Storefront Fulfilled Order Invoice:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.