import assert from "node:assert/strict";
import test from "node:test";
import { invoiceFulfilledOrder } from "../src/order_invoice.js";

const fulfilledOrder = {
  orderId: "order_1042",
  updateId: "update_fulfilled_3",
  status: "fulfilled",
  customer: {
    name: "Mina Chen",
    email: "mina@example.com",
    billingAddress: "18 Market Street, Shanghai"
  },
  receipt: {
    number: "RCPT-1042",
    status: "succeeded",
    paidAt: "2026-08-12T08:30:00.000Z"
  },
  currency: "USD",
  items: [{ name: "Canvas tote", quantity: 2, unitPriceCents: 2400 }]
} as const;

test("a fulfilled and paid order becomes an invoice exactly once", async () => {
  let calls = 0;
  const first = await invoiceFulfilledOrder(fulfilledOrder, async ({ html, idempotencyKey }) => {
    calls += 1;
    assert.match(html, /Canvas tote/);
    assert.equal(idempotencyKey.length, 64);
    return { url: "https://cdn.example.com/invoice-order-1042.pdf" };
  });
  const repeat = await invoiceFulfilledOrder({
    ...fulfilledOrder,
    invoice: { url: first.invoiceUrl }
  }, async () => {
    calls += 1;
    return { url: "https://cdn.example.com/second.pdf" };
  });

  assert.equal(first.state, "invoice_created");
  assert.equal(repeat.state, "already_invoiced");
  assert.equal(calls, 1);
});

test("a pending receipt blocks invoice creation", async () => {
  await assert.rejects(
    invoiceFulfilledOrder({
      ...fulfilledOrder,
      receipt: { ...fulfilledOrder.receipt, status: "pending" }
    }, async () => ({ url: "https://cdn.example.com/unexpected.pdf" })),
    /successful payment/
  );
});
