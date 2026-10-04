import { env } from "@/lib/env.server";
import { decryptSecret } from "@/lib/tenro/crypto.server";
import type { Sql } from "@/lib/db";

type Turn = { role: "user" | "assistant"; content: string };

type ModelRow = {
  id: string;
  provider_id: string;
  api_model: string;
  name: string;
  status: string;
  enabled: boolean;
  capabilities: string;
};

const OPENAI_BASE: Record<string, string> = {
  xai: "https://api.x.ai/v1",
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  longcat: "https://api.longcat.chat/openai/v1",
};

export function openAiBase(providerId: string) {
  return OPENAI_BASE[providerId] ?? null;
}

export async function loadModel(sql: Sql, modelId: string) {
  const rows = await sql<ModelRow>`
    select id, provider_id, api_model, name, status, enabled, capabilities
    from models
    where id = ${modelId}
  `;
  return rows[0] ?? null;
}

export async function resolveApiKey(sql: Sql, userId: string, providerId: string) {
  const rows = await sql<{ ciphertext: string }>`
    select ciphertext from user_provider_credentials
    where user_id = ${userId} and provider_id = ${providerId}
  `;
  if (rows[0]) return decryptSecret(rows[0].ciphertext);
  if (providerId === "xai") {
    const platform = env("XAI_API_KEY");
    if (platform) return platform;
  }
  return null;
}

export async function testProviderKey(providerId: string, apiKey: string) {
  if (providerId === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("That Anthropic key was rejected.");
    return;
  }
  if (providerId === "google") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error("That Gemini key was rejected.");
    return;
  }
  const base = OPENAI_BASE[providerId];
  if (!base) throw new Error("That provider isn't supported.");
  const response = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("That key was rejected by the provider.");
}

export async function completeChat(input: {
  providerId: string;
  apiModel: string;
  apiKey: string;
  system: string;
  messages: Turn[];
  maxTokens: number;
}) {
  if (input.providerId === "anthropic") return completeAnthropic(input);
  if (input.providerId === "google") return completeGoogle(input);
  return completeOpenAI(input);
}

async function completeOpenAI(input: {
  providerId: string;
  apiModel: string;
  apiKey: string;
  system: string;
  messages: Turn[];
  maxTokens: number;
}) {
  const base = OPENAI_BASE[input.providerId];
  if (!base) throw new Error("That provider isn't supported.");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.apiModel,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("The provider rejected the saved key.");
  if (response.status === 429) throw new Error("The provider is rate limiting this key. Try again shortly.");
  if (!response.ok) throw new Error("The provider couldn't answer just now.");
  const json = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The provider returned an empty answer.");
  return text;
}

async function completeAnthropic(input: {
  apiModel: string;
  apiKey: string;
  system: string;
  messages: Turn[];
  maxTokens: number;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.apiModel,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    }),
  });
  if (response.status === 401) throw new Error("The provider rejected the saved key.");
  if (response.status === 429) throw new Error("The provider is rate limiting this key. Try again shortly.");
  if (!response.ok) throw new Error("The provider couldn't answer just now.");
  const json = (await response.json()) as { content?: { text?: string }[] };
  const text = json.content?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("The provider returned an empty answer.");
  return text;
}

async function completeGoogle(input: {
  apiModel: string;
  apiKey: string;
  system: string;
  messages: Turn[];
  maxTokens: number;
}) {
  const contents = input.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.apiModel)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents,
      }),
    },
  );
  if (response.status === 400 || response.status === 403) throw new Error("The provider rejected the saved key or model.");
  if (response.status === 429) throw new Error("The provider is rate limiting this key. Try again shortly.");
  if (!response.ok) throw new Error("The provider couldn't answer just now.");
  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("The provider returned an empty answer.");
  return text;
}

export type ToolCall = { id: string; name: string; arguments: string };

export async function completeWithTools(input: {
  providerId: string;
  apiModel: string;
  apiKey: string;
  system: string;
  messages: Turn[];
  maxTokens: number;
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
}): Promise<{ text: string; calls: ToolCall[]; unsupported: boolean }> {
  const base = OPENAI_BASE[input.providerId];
  if (!base) return { text: "", calls: [], unsupported: true };
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.apiModel,
      max_tokens: input.maxTokens,
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: "auto",
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return { text: "", calls: [], unsupported: true };
  }
  if (response.status === 401 || response.status === 403) throw new Error("The provider rejected the saved key.");
  if (response.status === 429) throw new Error("The provider is rate limiting this key. Try again shortly.");
  if (!response.ok) throw new Error("The provider couldn't answer just now.");
  const json = (await response.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
      };
    }[];
  };
  const message = json.choices?.[0]?.message;
  const calls = (message?.tool_calls ?? [])
    .map((call) => ({
      id: call.id ?? "",
      name: call.function?.name ?? "",
      arguments: call.function?.arguments ?? "{}",
    }))
    .filter((call) => call.id && call.name)
    .slice(0, 3);
  return { text: message?.content?.trim() ?? "", calls, unsupported: false };
}

export async function completeAfterTools(input: {
  providerId: string;
  apiModel: string;
  apiKey: string;
  system: string;
  messages: Turn[];
  calls: ToolCall[];
  results: { id: string; content: string }[];
  maxTokens: number;
}) {
  const base = OPENAI_BASE[input.providerId];
  if (!base) throw new Error("That provider isn't supported.");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.apiModel,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((message) => ({ role: message.role, content: message.content })),
        {
          role: "assistant",
          content: null,
          tool_calls: input.calls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        },
        ...input.results.map((result) => ({
          role: "tool",
          tool_call_id: result.id,
          content: result.content,
        })),
      ],
    }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("The provider rejected the saved key.");
  if (response.status === 429) throw new Error("The provider is rate limiting this key. Try again shortly.");
  if (!response.ok) throw new Error("The provider couldn't answer just now.");
  const json = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The provider returned an empty answer.");
  return text;
}
