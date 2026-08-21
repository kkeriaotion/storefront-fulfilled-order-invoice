import { createHash } from "node:crypto";
import { z } from "zod";

export const orderUpdateSchema = z.object({
  orderId: z.string().min(1),
  updateId: z.string().min(1),
  status: z.enum(["checkout_pending", "paid", "fulfilled", "cancelled"]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    billingAddress: z.string().min(1)
  }),
  receipt: z.object({
    number: z.string().min(1),
    status: z.enum(["pending", "succeeded", "refunded"]),
    paidAt: z.string().datetime()
  }),
  currency: z.string().length(3),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative()
  })).min(1),
  invoice: z.object({ url: z.string().url() }).optional()
});

export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

export type InvoiceResult = {
  orderId: string;
  state: "invoice_created" | "already_invoiced";
  invoiceUrl: string;
};

export type GeneratePDF = (input: {
  html: string;
  idempotencyKey: string;
}) => Promise<{ url: string }>;

const escapeHTML = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
})[character] as string);

const money = (cents: number, currency: string): string =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);

export function renderInvoice(order: OrderUpdate): string {
  const rows = order.items.map((item) => {
    const amount = item.quantity * item.unitPriceCents;
    return `<tr><td>${escapeHTML(item.name)}</td><td>${item.quantity}</td><td>${money(item.unitPriceCents, order.currency)}</td><td>${money(amount, order.currency)}</td></tr>`;
  }).join("");
  const total = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#202124;padding:40px}header{display:flex;justify-content:space-between}table{border-collapse:collapse;width:100%;margin-top:32px}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left}th:last-child,td:last-child{text-align:right}.total{font-size:20px;font-weight:700;text-align:right;margin-top:24px}</style></head><body><header><div><h1>Invoice</h1><p>${escapeHTML(order.receipt.number)}</p></div><div><strong>${escapeHTML(order.customer.name)}</strong><br>${escapeHTML(order.customer.billingAddress)}</div></header><p>Order ${escapeHTML(order.orderId)}<br>Paid ${escapeHTML(order.receipt.paidAt.slice(0, 10))}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Total ${money(total, order.currency)}</p></body></html>`;
}

export async function invoiceFulfilledOrder(
  body: unknown,
  generatePDF: GeneratePDF
): Promise<InvoiceResult> {
  const order = orderUpdateSchema.parse(body);
  if (order.invoice) {
    return { orderId: order.orderId, state: "already_invoiced", invoiceUrl: order.invoice.url };
  }
  if (order.status !== "fulfilled") {
    throw new Error("The order must be fulfilled before invoicing");
  }
  if (order.receipt.status !== "succeeded") {
    throw new Error("The receipt must show a successful payment before invoicing");
  }

  const idempotencyKey = createHash("sha256")
    .update(`${order.orderId}:${order.updateId}:${order.receipt.number}`)
    .digest("hex");
  const generated = await generatePDF({ html: renderInvoice(order), idempotencyKey });
  return { orderId: order.orderId, state: "invoice_created", invoiceUrl: generated.url };
}
