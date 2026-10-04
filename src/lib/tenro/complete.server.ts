import { env } from "@/lib/env.server";
import type { StyleId } from "@/lib/profile";
import { getModel } from "@/lib/tenro/models";

const STYLE: Record<StyleId, string> = {
  calm: "Be steady, unhurried, and clear.",
  direct: "Be short and direct. Skip extra talk.",
  bright: "Be warm, quick, and a little playful.",
};

export type CompletionInput = {
  modelId: string;
  style: StyleId;
  preferredName: string;
  messages: { role: "user" | "assistant"; text: string }[];
};

export async function completeTenro(input: CompletionInput) {
  const model = getModel(input.modelId);
  if (!model || model.provider !== "xai" || model.status !== "available") {
    throw new Error("That model isn't available.");
  }

  const key = env("XAI_API_KEY");
  if (!key) throw new Error("Tenro can't reach a model right now.");

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(40_000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.apiModel,
      temperature: model.capabilities.includes("reasoning") ? 0.4 : 0.7,
      max_tokens: model.capabilities.includes("fast") ? 420 : 700,
      messages: [
        {
          role: "system",
          content: `You are Tenro, a personal AI agent with your own voice. You are not a generic chatbot. Call the person ${input.preferredName}. ${STYLE[input.style]} Answer in plain sentences. If you are unsure, say so.`,
        },
        ...input.messages.map((message) => ({
          role: message.role,
          content: message.text.slice(0, 4000),
        })),
      ],
    }),
  });

  if (!response.ok) throw new Error("Tenro couldn't answer just now.");

  const json = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Tenro returned an empty answer.");
  return { text };
}
