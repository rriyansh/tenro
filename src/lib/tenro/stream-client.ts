import { getBearerToken } from "@/lib/auth/client";

export type StreamReply = {
  conversation: { id: string; title: string; model_id: string; pinned: boolean };
  user: { id: string; role: "user"; content: string; model_id: null };
  assistant: { id: string; role: "assistant"; content: string; model_id: string };
  activity: string[];
  pendingApproval: { id: string; detail: string } | null;
};

export class StreamFallback extends Error {}

export async function streamChat(
  input: { text: string; modelId: string; conversationId: string | null },
  onDelta: (text: string) => void,
): Promise<StreamReply> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch("/api/tenro/chat", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ ...input, mode: "chat" }),
  });
  if (!response.ok) throw new StreamFallback(await readError(response));
  if (!response.body) throw new StreamFallback("The provider couldn't answer just now.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let sawDelta = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as {
        delta?: string;
        error?: string;
        done?: boolean;
        result?: StreamReply;
      };
      if (payload.delta) {
        sawDelta = true;
        full += payload.delta;
        onDelta(full);
      }
      if (payload.error) throw sawDelta ? new Error(payload.error) : new StreamFallback(payload.error);
      if (payload.done && payload.result) return payload.result;
    }
  }
  throw new Error("The reply ended early.");
}

async function readError(response: Response) {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error || "Tenro couldn't answer just now.";
  } catch {
    return "Tenro couldn't answer just now.";
  }
}
