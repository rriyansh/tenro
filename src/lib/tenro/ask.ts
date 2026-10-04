import { createServerFn } from "@tanstack/react-start";
import type { StyleId } from "@/lib/profile";
import type { CompletionInput } from "@/lib/tenro/complete.server";
import { getModel } from "@/lib/tenro/models";

const STYLES = new Set<StyleId>(["calm", "direct", "bright"]);

function readAsk(input: unknown): CompletionInput {
  if (!input || typeof input !== "object") throw new Error("Invalid request.");
  const row = input as Record<string, unknown>;
  if (typeof row.modelId !== "string") throw new Error("Unknown model.");
  const model = getModel(row.modelId);
  if (!model || model.provider !== "xai" || model.status !== "available") {
    throw new Error("That model isn't available.");
  }
  if (!STYLES.has(row.style as StyleId)) throw new Error("Unknown style.");
  const preferredName = typeof row.preferredName === "string" ? row.preferredName.slice(0, 24) : "there";
  if (!Array.isArray(row.messages) || row.messages.length === 0 || row.messages.length > 12) {
    throw new Error("Invalid request.");
  }
  const messages = row.messages.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid request.");
    const message = item as Record<string, unknown>;
    let role: "user" | "assistant";
    if (message.role === "user") role = "user";
    else if (message.role === "assistant") role = "assistant";
    else throw new Error("Invalid request.");
    if (typeof message.text !== "string" || message.text.trim().length === 0) throw new Error("Invalid request.");
    return { role, text: message.text.slice(0, 4000) };
  });
  if (messages[messages.length - 1]?.role !== "user") throw new Error("Invalid request.");
  return {
    modelId: model.id,
    style: row.style as StyleId,
    preferredName: preferredName.trim() || "there",
    messages,
  };
}

export const askTenro = createServerFn({ method: "POST" })
  .validator(readAsk)
  .handler(async ({ data }) => {
    const { completeTenro } = await import("@/lib/tenro/complete.server");
    return completeTenro(data);
  });
