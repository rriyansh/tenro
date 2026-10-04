import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { preferenceModelId } from "@/lib/tenro/models";
import { LEGAL_DOCS } from "@/lib/tenro/settings";

const HOUR_LIMIT = 40;

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export type ProfileRow = {
  name: string;
  preferredName: string;
  style: string;
  appearance: string;
  defaultModelId: string;
  role: string;
};

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ProfileRow | null> => {
    const sql = await getSql();
    const rows = await sql<{
      name: string;
      preferred_name: string;
      style: string;
      appearance: string;
      default_model_id: string;
      role: string;
    }>`
      select name, preferred_name, style, appearance, default_model_id, role
      from profiles where user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      name: row.name,
      preferredName: row.preferred_name,
      style: row.style,
      appearance: row.appearance,
      defaultModelId: row.default_model_id,
      role: row.role,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid profile.");
    const row = input as Record<string, unknown>;
    const name = text(row.name, 40);
    const preferredName = text(row.preferredName, 24);
    if (name.length < 2 || preferredName.length < 1) throw new Error("Enter your name.");
    const style = row.style === "direct" || row.style === "bright" ? row.style : "calm";
    const appearance = row.appearance === "dusk" || row.appearance === "dawn" ? row.appearance : "grove";
    const modelPref = typeof row.model === "string" ? row.model : "tenro";
    return { name, preferredName, style, appearance, modelId: preferenceModelId(modelPref) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, name, preferred_name, style, appearance, default_model_id, onboarded_at)
      values (${context.userId}, ${data.name}, ${data.preferredName}, ${data.style}, ${data.appearance}, ${data.modelId}, now())
      on conflict (user_id) do update set
        name = excluded.name,
        preferred_name = excluded.preferred_name,
        style = excluded.style,
        appearance = excluded.appearance,
        default_model_id = excluded.default_model_id,
        onboarded_at = coalesce(profiles.onboarded_at, now()),
        updated_at = now()
    `;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'profile_updated', 'Name, style, or colour was updated.')
    `;
    return { ok: true as const };
  });

export const listModels = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    return sql<{
      id: string;
      provider_id: string;
      name: string;
      description: string;
      capabilities: string;
      context_label: string;
      status: string;
      enabled: boolean;
    }>`
      select id, provider_id, name, description, capabilities, context_label, status, enabled
      from models
      where enabled = true
      order by provider_id, name
    `;
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; title: string; model_id: string; pinned: boolean; project_id: string | null; updated_at: string }>`
      select id, title, model_id, pinned, project_id, updated_at
      from conversations
      where user_id = ${context.userId} and archived = false
      order by pinned desc, updated_at desc
      limit 40
    `;
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { conversationId?: unknown })?.conversationId, 80);
    if (!id) throw new Error("Missing conversation.");
    return { conversationId: id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owned = await sql<{ id: string }>`
      select id from conversations where id = ${data.conversationId} and user_id = ${context.userId}
    `;
    if (!owned[0]) throw new Error("That conversation isn't yours.");
    return sql<{ id: string; role: string; content: string; model_id: string | null }>`
      select id, role, content, model_id
      from messages
      where conversation_id = ${data.conversationId} and user_id = ${context.userId}
      order by created_at asc
      limit 80
    `;
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid message.");
    const row = input as Record<string, unknown>;
    const content = text(row.text, 4000);
    const modelId = text(row.modelId, 80);
    const conversationId = text(row.conversationId, 80);
    if (!content || !modelId) throw new Error("Write a message and pick a model.");
    const mode: "chat" | "agent" = row.mode === "agent" ? "agent" : "chat";
    return { content, modelId, conversationId: conversationId || null, mode };
  })
  .handler(async ({ context, data }) => {
    const { runChat } = await import("@/lib/tenro/chat-turn.server");
    return runChat(context.userId, data);
  });

export const setConversationModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { id?: unknown; modelId?: unknown };
    const id = text(row?.id, 80);
    const modelId = text(row?.modelId, 80);
    if (!id || !modelId) throw new Error("Missing model.");
    return { id, modelId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const updated = await sql<{ id: string }>`
      update conversations set model_id = ${data.modelId}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!updated[0]) throw new Error("That conversation isn't yours.");
    return { ok: true as const };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing conversation.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from conversations where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const clearConversations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const confirm = text((input as { confirm?: unknown })?.confirm, 20);
    if (confirm !== "CLEAR") throw new Error("Type CLEAR to confirm.");
    return { confirm };
  })
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`delete from conversations where user_id = ${context.userId}`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'chats_cleared', 'All conversations were deleted.')
    `;
    return { ok: true as const };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { id?: unknown; title?: unknown };
    const id = text(row?.id, 80);
    const title = text(row?.title, 80);
    if (!id || !title) throw new Error("Enter a title.");
    return { id, title };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const updated = await sql<{ id: string }>`
      update conversations set title = ${data.title}
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!updated[0]) throw new Error("That conversation isn't yours.");
    return { ok: true as const };
  });

export const listCredentials = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ provider_id: string; hint: string; created_at: string }>`
      select provider_id, hint, created_at
      from user_provider_credentials
      where user_id = ${context.userId}
      order by provider_id
    `;
  });

export const saveCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { providerId?: unknown; secret?: unknown };
    const providerId = text(row?.providerId, 40);
    const secret = typeof row?.secret === "string" ? row.secret.trim() : "";
    if (!providerId || secret.length < 8 || secret.length > 400) throw new Error("Enter a provider key.");
    return { providerId, secret };
  })
  .handler(async ({ context, data }) => {
    const { encryptSecret, secretHint } = await import("@/lib/tenro/crypto.server");
    const { testProviderKey } = await import("@/lib/tenro/gateway.server");
    await testProviderKey(data.providerId, data.secret);
    const sql = await getSql();
    const hint = secretHint(data.secret);
    const ciphertext = encryptSecret(data.secret);
    await sql`
      insert into user_provider_credentials (user_id, provider_id, ciphertext, hint)
      values (${context.userId}, ${data.providerId}, ${ciphertext}, ${hint})
      on conflict (user_id, provider_id) do update set
        ciphertext = excluded.ciphertext,
        hint = excluded.hint,
        created_at = now()
    `;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'provider_connected', ${data.providerId})
    `;
    return { ok: true as const, hint };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const providerId = text((input as { providerId?: unknown })?.providerId, 40);
    if (!providerId) throw new Error("Missing provider.");
    return { providerId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      delete from user_provider_credentials
      where user_id = ${context.userId} and provider_id = ${data.providerId}
    `;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'provider_removed', ${data.providerId})
    `;
    return { ok: true as const };
  });

export const listFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; name: string; mime: string; size_bytes: number; created_at: string }>`
      select id, name, mime, size_bytes, created_at from files
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
  });

export const saveFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { name?: unknown; body?: unknown };
    const name = text(row?.name, 120);
    const body = typeof row?.body === "string" ? row.body.slice(0, 100_000) : "";
    if (!name || !body) throw new Error("Choose a text file.");
    return { name, body };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const flag = await sql<{ enabled: boolean }>`select enabled from feature_flags where key = 'file_upload'`;
    if (flag[0] && flag[0].enabled === false) throw new Error("File upload is turned off.");
    const id = crypto.randomUUID();
    await sql`
      insert into files (id, user_id, name, mime, size_bytes, body)
      values (${id}, ${context.userId}, ${data.name}, 'text/plain', ${data.body.length}, ${data.body})
    `;
    return { id, name: data.name, size_bytes: data.body.length };
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing file.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from files where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const renameFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { id?: unknown; name?: unknown };
    const id = text(row?.id, 80);
    const name = text(row?.name, 80).replace(/[^\w.\- ]+/g, "");
    if (!id || !name) throw new Error("Enter a file name.");
    return { id, name };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update files set name = ${data.name} where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("That file isn't yours.");
    return { ok: true as const };
  });

export const updateDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { id?: unknown; body?: unknown };
    const id = text(row?.id, 80);
    const body = typeof row?.body === "string" ? row.body.slice(0, 80_000) : "";
    if (!id || !body) throw new Error("Write something to save.");
    return { id, body };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ mime: string }>`
      select mime from files where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("That file isn't yours.");
    if (rows[0].mime === "application/pdf") throw new Error("Create a new PDF instead of editing this one.");
    if (rows[0].mime === "application/json") {
      try {
        JSON.parse(data.body);
      } catch {
        throw new Error("That isn't valid JSON.");
      }
    }
    await sql`
      update files set body = ${data.body}, size_bytes = ${data.body.length}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; name: string }>`
      select id, name from projects where user_id = ${context.userId} order by created_at desc limit 40
    `;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const name = text((input as { name?: unknown })?.name, 60);
    if (name.length < 2) throw new Error("Name the project.");
    return { name };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = crypto.randomUUID();
    await sql`insert into projects (id, user_id, name) values (${id}, ${context.userId}, ${data.name})`;
    return { id, name: data.name };
  });

export const usageSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ model_id: string; count: number }>`
      select model_id, count(*) as count
      from usage_records
      where user_id = ${context.userId}
      group by model_id
      order by count desc
      limit 12
    `;
    const hour = await sql<{ count: number }>`
      select count(*) as count from usage_records
      where user_id = ${context.userId} and created_at > now() - interval '1 hour'
    `;
    return { models: rows, hour: hour[0]?.count ?? 0, hourLimit: HOUR_LIMIT };
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; created_at: string; ip_address: string | null; user_agent: string | null }>`
      select id, "createdAt" as created_at, "ipAddress" as ip_address, "userAgent" as user_agent
      from "session"
      where "userId" = ${context.userId}
      order by "createdAt" desc
      limit 10
    `;
  });

export const revokeSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing session.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from "session" where id = ${data.id} and "userId" = ${context.userId}`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'session_revoked', 'A session was revoked.')
    `;
    return { ok: true as const };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; kind: string; body: string; read_at: string | null; created_at: string }>`
      select id, kind, body, read_at, created_at from notifications
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const role = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId}`;
    if (role[0]?.role !== "admin") throw new Error("Admin access is required.");
    const users = await sql<{ count: number }>`select count(*) as count from profiles`;
    const chats = await sql<{ count: number }>`select count(*) as count from conversations`;
    const messages = await sql<{ count: number }>`select count(*) as count from messages`;
    const calls = await sql<{ count: number }>`select count(*) as count from usage_records`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'admin_view', 'Opened the admin overview.')
    `;
    return {
      users: users[0]?.count ?? 0,
      chats: chats[0]?.count ?? 0,
      messages: messages[0]?.count ?? 0,
      calls: calls[0]?.count ?? 0,
    };
  });

export const setModelEnabled = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { id?: unknown; enabled?: unknown };
    const id = text(row?.id, 80);
    if (!id || typeof row?.enabled !== "boolean") throw new Error("Missing model.");
    return { id, enabled: row.enabled };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const role = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId}`;
    if (role[0]?.role !== "admin") throw new Error("Admin access is required.");
    await sql`update models set enabled = ${data.enabled} where id = ${data.id}`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'model_updated', ${`${data.id}:${data.enabled}`})
    `;
    return { ok: true as const };
  });

export const pinConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing conversation.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ pinned: boolean }>`
      update conversations set pinned = not pinned, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning pinned
    `;
    if (!rows[0]) throw new Error("That conversation isn't yours.");
    return { pinned: rows[0].pinned };
  });

export const archiveConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing conversation.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update conversations set archived = true, pinned = false, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("That conversation isn't yours.");
    return { ok: true as const };
  });

export const listArchived = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; title: string }>`
      select id, title from conversations
      where user_id = ${context.userId} and archived = true
      order by updated_at desc
      limit 40
    `;
  });

export const restoreConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing conversation.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; title: string; model_id: string; pinned: boolean; updated_at: string }>`
      update conversations set archived = false, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning id, title, model_id, pinned, updated_at
    `;
    if (!rows[0]) throw new Error("That conversation isn't yours.");
    return rows[0];
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing message.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      delete from messages where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("That message isn't yours.");
    return { ok: true as const };
  });

export const regenerateMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { conversationId?: unknown })?.conversationId, 80);
    if (!id) throw new Error("Missing conversation.");
    return { conversationId: id };
  })
  .handler(async ({ context, data }) => {
    const { regenerateReply } = await import("@/lib/tenro/chat-turn.server");
    return regenerateReply(context.userId, data.conversationId);
  });

export const editLatestMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { conversationId?: unknown; text?: unknown };
    const conversationId = text(row?.conversationId, 80);
    const content = text(row?.text, 4000);
    if (!conversationId || !content) throw new Error("Write the updated message.");
    return { conversationId, content };
  })
  .handler(async ({ context, data }) => {
    const { editLatestAndReply } = await import("@/lib/tenro/chat-turn.server");
    return editLatestAndReply(context.userId, data.conversationId, data.content);
  });

export const readFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing file.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; body: string }>`
      select id, name, body from files where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("That file isn't yours.");
    return rows[0];
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing project.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      delete from projects where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("That project isn't yours.");
    return { ok: true as const };
  });

export const assignProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { conversationId?: unknown; projectId?: unknown };
    const conversationId = text(row?.conversationId, 80);
    const projectId = text(row?.projectId, 80);
    if (!conversationId) throw new Error("Missing conversation.");
    return { conversationId, projectId: projectId || null };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.projectId) {
      const owned = await sql<{ id: string }>`
        select id from projects where id = ${data.projectId} and user_id = ${context.userId}
      `;
      if (!owned[0]) throw new Error("That project isn't yours.");
    }
    const rows = await sql<{ id: string }>`
      update conversations set project_id = ${data.projectId}, updated_at = now()
      where id = ${data.conversationId} and user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("That conversation isn't yours.");
    return { ok: true as const };
  });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; tool_id: string; payload: string; status: string; created_at: string }>`
      select id, tool_id, payload, status, created_at from approvals
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { id?: unknown; decision?: unknown };
    const id = text(row?.id, 80);
    const decision = row?.decision === "approved" || row?.decision === "denied" ? row.decision : "";
    if (!id || !decision) throw new Error("Choose approve or deny.");
    return { id, decision };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; tool_id: string; payload: string; status: string }>`
      select id, tool_id, payload, status from approvals
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("That request isn't yours.");
    if (row.status !== "pending") throw new Error("That request is already settled.");
    if (data.decision === "denied") {
      await sql`update approvals set status = 'denied' where id = ${row.id} and user_id = ${context.userId}`;
      return { ok: true as const, created: null };
    }
    if (row.tool_id !== "create_project") throw new Error("That action isn't supported.");
    let name = "";
    try {
      const payload = JSON.parse(row.payload) as { name?: unknown };
      name = typeof payload.name === "string" ? payload.name.trim().slice(0, 60) : "";
    } catch {
      name = "";
    }
    if (name.length < 2) throw new Error("That project name isn't valid.");
    const projectId = crypto.randomUUID();
    await sql`insert into projects (id, user_id, name) values (${projectId}, ${context.userId}, ${name})`;
    await sql`update approvals set status = 'approved' where id = ${row.id} and user_id = ${context.userId}`;
    let notifyAgent = true;
    try {
      const notify = await sql<{ notify_agent: boolean }>`
        select notify_agent from user_settings where user_id = ${context.userId}
      `;
      if (notify[0]?.notify_agent === false) notifyAgent = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/user_settings/.test(message)) throw error;
    }
    if (notifyAgent) {
      await sql`
        insert into notifications (id, user_id, kind, body)
        values (${crypto.randomUUID()}, ${context.userId}, 'project', ${`Created the project ${name}.`})
      `;
    }
    return { ok: true as const, created: { id: projectId, name } };
  });

export const listSecurityEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; kind: string; detail: string; created_at: string }>`
      select id, kind, detail, created_at from security_events
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      update notifications set read_at = now()
      where user_id = ${context.userId} and read_at is null
    `;
    return { ok: true as const };
  });

export const setDefaultModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const modelId = text((input as { modelId?: unknown })?.modelId, 80);
    if (!modelId) throw new Error("Pick a model.");
    return { modelId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const model = await sql<{ id: string }>`
      select id from models where id = ${data.modelId} and enabled = true and status = 'available'
    `;
    if (!model[0]) throw new Error("That model isn't available.");
    const updated = await sql<{ id: string }>`
      update profiles set default_model_id = ${data.modelId}, updated_at = now()
      where user_id = ${context.userId}
      returning user_id as id
    `;
    if (!updated[0]) throw new Error("Finish setup first.");
    return { ok: true as const };
  });

export const clearAccountData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const confirm = text((input as { confirm?: unknown })?.confirm, 20);
    if (confirm !== "DELETE") throw new Error("Type DELETE to confirm.");
    return { confirm };
  })
  .handler(async ({ context, data }) => {
    if (data.confirm !== "DELETE") throw new Error("Type DELETE to confirm.");
    const sql = await getSql();
    const userId = context.userId;
    await sql`delete from conversations where user_id = ${userId}`;
    await sql`delete from files where user_id = ${userId}`;
    await sql`delete from projects where user_id = ${userId}`;
    await sql`delete from user_provider_credentials where user_id = ${userId}`;
    await sql`delete from notifications where user_id = ${userId}`;
    await sql`delete from usage_records where user_id = ${userId}`;
    await sql`delete from agent_runs where user_id = ${userId}`;
    await sql`delete from profiles where user_id = ${userId}`;
    await sql`delete from user_settings where user_id = ${userId}`;
    await sql`delete from legal_acceptances where user_id = ${userId}`;
    await sql`delete from approvals where user_id = ${userId}`;
    await sql`delete from security_events where user_id = ${userId}`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${userId}, 'data_cleared', 'Tenro data was deleted. The sign-in remains.')
    `;
    return { ok: true as const };
  });

export const probeConnector = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 40);
    if (id !== "drive" && id !== "calendar") throw new Error("That connector can't be checked.");
    return { id };
  })
  .handler(async ({ data }) => {
    const { callTool } = await import("@/lib/app-data/client.server");
    const { ConnectorType, GoogleDriveTools, GoogleCalendarTools } = await import("@/lib/app-data/types");
    const result =
      data.id === "drive"
        ? await callTool(GoogleDriveTools.search, { q: "a" }, { connectorType: ConnectorType.GoogleDrive })
        : await callTool(GoogleCalendarTools.listCalendars, {}, { connectorType: ConnectorType.GoogleCalendar });
    if (result.ok) return { state: "connected" as const, detail: summarizeConnector(result.data), loginUrl: null };
    if (result.pending) {
      return { state: "pending" as const, detail: "This session doesn't have a connector grant yet.", loginUrl: null };
    }
    if (result.loginRequired) {
      return {
        state: "login" as const,
        detail: "Sign in through the connector gate to use this.",
        loginUrl: result.loginUrl ?? null,
      };
    }
    return {
      state: "unavailable" as const,
      detail: safeConnectorError(result.errorMessage),
      loginUrl: null,
    };
  });

function summarizeConnector(data: unknown) {
  if (Array.isArray(data)) return `Connected. ${data.length} item${data.length === 1 ? "" : "s"} came back.`;
  if (data && typeof data === "object") {
    const record = data as { files?: unknown; items?: unknown; calendars?: unknown };
    const list = [record.files, record.items, record.calendars].find(Array.isArray);
    if (Array.isArray(list)) return `Connected. ${list.length} item${list.length === 1 ? "" : "s"} came back.`;
  }
  return "Connected. The connector answered.";
}

function safeConnectorError(message: string | undefined) {
  if (!message) return "The connector didn't answer.";
  const clean = message.replace(/\s+/g, " ").slice(0, 180);
  if (/token|secret|key|authorization/i.test(clean)) return "The connector isn't authorized for this session.";
  return clean;
}

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const role = await sql<{ role: string }>`select role from profiles where user_id = ${userId}`;
  if (role[0]?.role !== "admin") throw new Error("Admin access is required.");
  return sql;
}

export const adminListModels = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await requireAdmin(context.userId);
    return sql<{ id: string; name: string; provider_id: string; enabled: boolean; status: string }>`
      select id, name, provider_id, enabled, status from models order by provider_id, name
    `;
  });

export const adminListFlags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await requireAdmin(context.userId);
    return sql<{ key: string; enabled: boolean }>`select key, enabled from feature_flags order by key`;
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { key?: unknown; enabled?: unknown };
    const key = text(row?.key, 40);
    if ((key !== "agent_mode" && key !== "file_upload") || typeof row?.enabled !== "boolean") {
      throw new Error("That flag isn't recognized.");
    }
    return { key, enabled: row.enabled };
  })
  .handler(async ({ context, data }) => {
    const sql = await requireAdmin(context.userId);
    await sql`update feature_flags set enabled = ${data.enabled}, updated_at = now() where key = ${data.key}`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'flag_updated', ${`${data.key}:${data.enabled}`})
    `;
    return { ok: true as const };
  });

export const health = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  await sql`select 1 as ok`;
  return { ok: true as const, database: true };
});

const SETTING_ENUMS = {
  avatarId: ["mark", "smile", "curious", "think", "initials"],
  language: ["en", "hi", "es"],
  theme: ["system", "dark", "light"],
  density: ["comfortable", "compact"],
  fontScale: ["sm", "md", "lg"],
  motion: ["system", "full", "reduce"],
  contrast: ["default", "high"],
  responseLength: ["short", "normal", "long"],
} as const;

function bool(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export const getSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      username: string | null;
      avatar_id: string;
      language: string;
      timezone: string;
      theme: string;
      density: string;
      font_scale: string;
      motion: string;
      contrast: string;
      response_length: string;
      streaming: boolean;
      confirm_tools: boolean;
      confirm_delete: boolean;
      markdown: boolean;
      auto_title: boolean;
      memory_enabled: boolean;
      notify_in_app: boolean;
      notify_agent: boolean;
      notify_security: boolean;
      notify_account: boolean;
      notify_provider: boolean;
    }>`
      select username, avatar_id, language, timezone, theme, density, font_scale, motion, contrast,
        response_length, streaming, confirm_tools, confirm_delete, markdown, auto_title, memory_enabled,
        notify_in_app, notify_agent, notify_security, notify_account, notify_provider
      from user_settings where user_id = ${context.userId}
    `;
    return rows[0] ?? null;
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid settings.");
    const row = input as Record<string, unknown>;
    const next: Record<string, string | boolean | null> = {};
    for (const [key, allowed] of Object.entries(SETTING_ENUMS)) {
      if (row[key] === undefined) continue;
      const value = text(row[key], 24);
      if (!(allowed as readonly string[]).includes(value)) throw new Error("That choice isn't available.");
      next[key] = value;
    }
    if (row.timezone !== undefined) {
      const zone = text(row.timezone, 64);
      try {
        Intl.DateTimeFormat("en", { timeZone: zone });
      } catch {
        throw new Error("That timezone isn't recognized.");
      }
      next.timezone = zone;
    }
    if (row.username !== undefined) {
      const username = text(row.username, 20).toLowerCase();
      if (username && !/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("Usernames are 3\u201320 letters, numbers, or underscores.");
      next.username = username || null;
    }
    for (const key of [
      "streaming",
      "confirmTools",
      "confirmDelete",
      "markdown",
      "autoTitle",
      "memoryEnabled",
      "notifyInApp",
      "notifyAgent",
      "notifySecurity",
      "notifyAccount",
      "notifyProvider",
    ]) {
      const value = bool(row[key]);
      if (value !== undefined) next[key] = value;
    }
    if (!Object.keys(next).length) throw new Error("Nothing to save.");
    return next;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (typeof data.username === "string") {
      const taken = await sql<{ user_id: string }>`
        select user_id from user_settings where username = ${data.username} and user_id <> ${context.userId}
      `;
      if (taken[0]) throw new Error("That username is taken.");
    }
    await sql`
      insert into user_settings (user_id) values (${context.userId})
      on conflict (user_id) do nothing
    `;
    const column: Record<string, string> = {
      avatarId: "avatar_id",
      fontScale: "font_scale",
      responseLength: "response_length",
      confirmTools: "confirm_tools",
      confirmDelete: "confirm_delete",
      autoTitle: "auto_title",
      memoryEnabled: "memory_enabled",
      notifyInApp: "notify_in_app",
      notifyAgent: "notify_agent",
      notifySecurity: "notify_security",
      notifyAccount: "notify_account",
      notifyProvider: "notify_provider",
    };
    for (const [key, value] of Object.entries(data)) {
      const name = column[key] ?? key;
      if (!/^[a-z_]+$/.test(name)) continue;
      await sql.query(`update user_settings set ${name} = $1, updated_at = now() where user_id = $2`, [value, context.userId]);
    }
    if ("memoryEnabled" in data || "username" in data) {
      await sql`
        insert into security_events (id, user_id, kind, detail)
        values (${crypto.randomUUID()}, ${context.userId}, 'settings_updated', ${Object.keys(data).join(",")})
      `;
    }
    return { ok: true as const };
  });

export const listLegalAcceptances = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ document_key: string; version: string; accepted_at: string }>`
      select document_key, version, accepted_at from legal_acceptances
      where user_id = ${context.userId}
      order by accepted_at desc
    `;
  });

export const acceptLegal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { key?: unknown; version?: unknown };
    const key = text(row?.key, 40);
    const version = text(row?.version, 40);
    if (!LEGAL_DOCS.some((doc) => doc.key === key && doc.version === version)) throw new Error("That document version isn't current.");
    return { key, version };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into legal_acceptances (id, user_id, document_key, version)
      values (${crypto.randomUUID()}, ${context.userId}, ${data.key}, ${data.version})
      on conflict (user_id, document_key, version) do nothing
    `;
    return { ok: true as const };
  });

async function sessionIdForRequest() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { auth } = await import("@/lib/auth/server");
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.session?.id ?? null;
}

export const listDeviceSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const currentId = await sessionIdForRequest();
    const sessions = await sql<{ id: string; created_at: string; ip_address: string | null; user_agent: string | null }>`
      select id, "createdAt" as created_at, "ipAddress" as ip_address, "userAgent" as user_agent
      from "session"
      where "userId" = ${context.userId}
      order by "createdAt" desc
      limit 12
    `;
    return { currentId, sessions };
  });

export const revokeOtherSessions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const currentId = await sessionIdForRequest();
    if (!currentId) throw new Error("Couldn't tell which session is this device. Revoke them one at a time.");
    const sql = await getSql();
    await sql`delete from "session" where "userId" = ${context.userId} and id <> ${currentId}`;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'sessions_revoked', 'Other sessions were signed out.')
    `;
    return { ok: true as const };
  });

export const testStoredCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const providerId = text((input as { providerId?: unknown })?.providerId, 40);
    if (!providerId || providerId === "xai") throw new Error("That provider uses Tenro\u2019s connection.");
    return { providerId };
  })
  .handler(async ({ context, data }) => {
    const { decryptSecret } = await import("@/lib/tenro/crypto.server");
    const { testProviderKey } = await import("@/lib/tenro/gateway.server");
    const sql = await getSql();
    const rows = await sql<{ ciphertext: string }>`
      select ciphertext from user_provider_credentials
      where user_id = ${context.userId} and provider_id = ${data.providerId}
    `;
    if (!rows[0]) throw new Error("No key is saved for that provider.");
    await testProviderKey(data.providerId, decryptSecret(rows[0].ciphertext));
    return { ok: true as const };
  });

export const saveDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = input as { name?: unknown; format?: unknown; body?: unknown };
    const name = text(row?.name, 80).replace(/[^\w.\- ]+/g, "") || "note";
    const format = text(row?.format, 12);
    const body = typeof row?.body === "string" ? row.body.slice(0, 80_000) : "";
    if (!body) throw new Error("Write something to save.");
    if (!["txt", "md", "csv", "json", "code", "pdf"].includes(format)) throw new Error("That file type isn't supported.");
    if (format === "json") {
      try {
        JSON.parse(body);
      } catch {
        throw new Error("That isn't valid JSON.");
      }
    }
    return { name, format, body };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const flag = await sql<{ enabled: boolean }>`select enabled from feature_flags where key = 'file_upload'`;
    if (flag[0]?.enabled === false) throw new Error("File saving is turned off.");
    const id = crypto.randomUUID();
    const mime =
      data.format === "md"
        ? "text/markdown"
        : data.format === "csv"
          ? "text/csv"
          : data.format === "json"
            ? "application/json"
            : data.format === "pdf"
              ? "application/pdf"
              : "text/plain";
    const stored = data.format === "pdf" ? (await import("@/lib/tenro/pdf.server")).textToPdf(data.name, data.body) : data.body;
    const fileName = data.name.includes(".") ? data.name : `${data.name}.${data.format === "code" ? "txt" : data.format}`;
    await sql`
      insert into files (id, user_id, name, mime, size_bytes, body)
      values (${id}, ${context.userId}, ${fileName}, ${mime}, ${stored.length}, ${stored})
    `;
    return { id, name: fileName, mime, size_bytes: stored.length };
  });

export const readDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = text((input as { id?: unknown })?.id, 80);
    if (!id) throw new Error("Missing file.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ name: string; mime: string; body: string }>`
      select name, mime, body from files where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("That file isn't yours.");
    return rows[0];
  });

export const exportAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await sql<{ name: string; preferred_name: string; style: string; appearance: string; default_model_id: string }>`
      select name, preferred_name, style, appearance, default_model_id from profiles where user_id = ${context.userId}
    `;
    const settings = await sql<{ username: string | null; language: string; timezone: string; theme: string; memory_enabled: boolean }>`
      select username, language, timezone, theme, memory_enabled from user_settings where user_id = ${context.userId}
    `;
    const conversations = await sql<{ id: string; title: string; model_id: string; created_at: string }>`
      select id, title, model_id, created_at from conversations where user_id = ${context.userId} order by updated_at desc limit 100
    `;
    const messages = await sql<{ conversation_id: string; role: string; content: string; created_at: string }>`
      select conversation_id, role, content, created_at from messages where user_id = ${context.userId} order by created_at desc limit 400
    `;
    const files = await sql<{ name: string; mime: string; size_bytes: number; created_at: string }>`
      select name, mime, size_bytes, created_at from files where user_id = ${context.userId} order by created_at desc limit 40
    `;
    const events = await sql<{ kind: string; detail: string; created_at: string }>`
      select kind, detail, created_at from security_events where user_id = ${context.userId} order by created_at desc limit 40
    `;
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'data_exported', 'Account export downloaded.')
    `;
    return {
      exportedAt: new Date().toISOString(),
      profile: profile[0] ?? null,
      settings: settings[0] ?? null,
      conversations,
      messages,
      files,
      securityEvents: events,
      note: "Provider keys and session tokens are not included.",
    };
  });

export const recordPasswordChanged = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      insert into security_events (id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${context.userId}, 'password_changed', 'Password was updated from Settings.')
    `;
    return { ok: true as const };
  });
