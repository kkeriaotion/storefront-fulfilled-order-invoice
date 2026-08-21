import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createPDFGenerator } from "../src/infrai_pdf.js";
import { invoiceFulfilledOrder } from "../src/order_invoice.js";

const inputPath = resolve(process.argv[2] ?? "examples/fulfilled_order.json");
const outputPath = resolve(process.argv[3] ?? "output/invoice.pdf");
const apiKey = process.env.INFRAI_API_KEY ?? "";
const body: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const result = await invoiceFulfilledOrder(body, createPDFGenerator(apiKey));

await mkdir(resolve(outputPath, ".."), { recursive: true });
const pdfResponse = await fetch(result.invoiceUrl, { method: "GET" });
if (!pdfResponse.ok) throw new Error(`Could not download generated PDF: HTTP ${pdfResponse.status}`);
await writeFile(outputPath, Buffer.from(await pdfResponse.arrayBuffer()));
console.log(`${result.state}: ${result.orderId} -> ${basename(outputPath)}`);
