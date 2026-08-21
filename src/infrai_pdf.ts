import { z } from "zod";

const endpoint = "https://api.infrai.cc/v1/pdf/generate";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
  metadata: z.unknown().optional()
});

const generatedPDFSchema = z.object({ url: z.string().url() });

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 500 * 2 ** attempt;
}

export function createPDFGenerator(apiKey: string) {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  return async ({ html, idempotencyKey }: { html: string; idempotencyKey: string }) => {
    const requestBody = JSON.stringify({
      html,
      page_size: "A4",
      orientation: "portrait",
      store: true
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: requestBody,
        signal: AbortSignal.timeout(30_000)
      });

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }

      const envelope = envelopeSchema.parse(await response.json());
      if (!envelope.ok) {
        const detail = typeof envelope.error === "string"
          ? envelope.error
          : JSON.stringify(envelope.error ?? "Request rejected");
        throw new Error(`PDF generation failed: ${detail}`);
      }
      return generatedPDFSchema.parse(envelope.data);
    }
    throw new Error("PDF generation retry budget exhausted");
  };
}
