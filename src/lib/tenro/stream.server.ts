import { auth } from "@/lib/auth/server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { getSql } from "@/lib/db";
import {
  cleanupFailedTurn,
  insertUser,
  persistAssistant,
  prepareChat,
  streamProvider,
} from "@/lib/tenro/chat-turn.server";
import { openAiBase } from "@/lib/tenro/gateway.server";

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function handleChatStream(request: Request) {
  try {
    assertSameSiteRequest();
  } catch {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid message." }, { status: 400 });
  }
  const row = (body ?? {}) as Record<string, unknown>;
  if (row.mode === "agent") return Response.json({ error: "Agent mode doesn't stream." }, { status: 409 });
  const content = text(row.text, 4000);
  const modelId = text(row.modelId, 80);
  const conversationId = text(row.conversationId, 80);
  if (!content || !modelId) return Response.json({ error: "Write a message and pick a model." }, { status: 400 });

  const sql = await getSql();
  let prepared;
  try {
    prepared = await prepareChat(sql, userId, {
      content,
      modelId,
      conversationId: conversationId || null,
      mode: "chat",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tenro couldn't answer just now.";
    return Response.json({ error: message }, { status: 400 });
  }

  if (!openAiBase(prepared.model.provider_id)) {
    await cleanupFailedTurn(sql, userId, prepared, null);
    return Response.json({ error: "This provider doesn't stream." }, { status: 409 });
  }

  let upstream: Response;
  try {
    const opened = await streamProvider(prepared, content);
    if (!opened) {
      await cleanupFailedTurn(sql, userId, prepared, null);
      return Response.json({ error: "This provider doesn't stream." }, { status: 409 });
    }
    upstream = opened;
  } catch (error) {
    await cleanupFailedTurn(sql, userId, prepared, null);
    const message = error instanceof Error ? error.message : "The provider couldn't answer just now.";
    return Response.json({ error: message }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const bodyStream = upstream.body;
  if (!bodyStream) {
    await cleanupFailedTurn(sql, userId, prepared, null);
    return Response.json({ error: "The provider couldn't answer just now." }, { status: 502 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = bodyStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let userMessageId: string | null = null;
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* The browser closed the stream. Keep saving the reply. */
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
              const delta = json.choices?.[0]?.delta?.content ?? "";
              if (!delta) continue;
              answer += delta;
              send({ delta });
            } catch {
              /* ignore a non-JSON keepalive */
            }
          }
        }
        const textAnswer = answer.trim();
        if (!textAnswer) throw new Error("The provider returned an empty answer.");
        userMessageId = await insertUser(sql, userId, prepared.conversationId, content);
        const saved = await persistAssistant(sql, userId, prepared, userMessageId, content, textAnswer);
        send({ done: true, result: { ...saved, activity: [], pendingApproval: null } });
      } catch (error) {
        await cleanupFailedTurn(sql, userId, prepared, userMessageId);
        send({ error: error instanceof Error ? error.message : "The reply stopped early." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
