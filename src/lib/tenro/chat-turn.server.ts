import { getSql, type Sql } from "@/lib/db";
import {
  completeAfterTools,
  completeChat,
  completeWithTools,
  loadModel,
  openAiBase,
  resolveApiKey,
  type ToolCall,
} from "@/lib/tenro/gateway.server";

const HOUR_LIMIT = 40;

export type ChatRequest = {
  content: string;
  modelId: string;
  conversationId: string | null;
  mode: "chat" | "agent";
};

export type SavedReply = {
  conversation: { id: string; title: string; model_id: string; pinned: boolean };
  user: { id: string; role: "user"; content: string; model_id: null };
  assistant: { id: string; role: "assistant"; content: string; model_id: string };
  activity: string[];
  pendingApproval: { id: string; detail: string } | null;
};

type Prepared = {
  model: {
    id: string;
    provider_id: string;
    api_model: string;
    name: string;
    capabilities: string;
  };
  apiKey: string;
  conversationId: string;
  createdConversation: boolean;
  system: string;
  prior: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
};

const AGENT_TOOLS = [
  {
    name: "clock",
    description: "Read the current UTC time. Read-only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_projects",
    description: "List project names on this account. Read-only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_project",
    description: "Ask the user to approve a new project. This does not create the project.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Project name, 2 to 60 characters." } },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

function styleLine(style: string) {
  if (style === "direct") return "Be short and direct.";
  if (style === "bright") return "Be warm and a little playful.";
  return "Be steady and clear.";
}

export async function prepareChat(sql: Sql, userId: string, data: ChatRequest): Promise<Prepared> {
  const profile = await sql<{ preferred_name: string; style: string }>`
    select preferred_name, style from profiles where user_id = ${userId}
  `;
  if (!profile[0]) throw new Error("Finish setup before chatting.");
  if (data.mode === "agent") {
    const flag = await sql<{ enabled: boolean }>`select enabled from feature_flags where key = 'agent_mode'`;
    if (flag[0] && flag[0].enabled === false) throw new Error("Agent mode is turned off.");
  }
  const recent = await sql<{ count: number | string }>`
    select count(*) as count from usage_records
    where user_id = ${userId} and created_at > now() - interval '1 hour'
  `;
  if (Number(recent[0]?.count ?? 0) >= HOUR_LIMIT) {
    throw new Error("You've reached this hour's message limit. Try again later.");
  }
  const model = await loadModel(sql, data.modelId);
  if (!model || !model.enabled || model.status !== "available") throw new Error("That model isn't available.");
  const apiKey = await resolveApiKey(sql, userId, model.provider_id);
  if (!apiKey) throw new Error(`Connect ${model.provider_id} before using ${model.name}.`);

  let pref: {
    response_length: string;
    auto_title: boolean;
    memory_enabled: boolean;
    confirm_tools: boolean;
    language: string;
  } | undefined;
  try {
    const prefs = await sql<{
      response_length: string;
      auto_title: boolean;
      memory_enabled: boolean;
      confirm_tools: boolean;
      language: string;
    }>`
      select response_length, auto_title, memory_enabled, confirm_tools, language
      from user_settings where user_id = ${userId}
    `;
    pref = prefs[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/user_settings/.test(message)) throw error;
  }
  let conversationId = data.conversationId;
  let createdConversation = false;
  if (conversationId) {
    const owned = await sql<{ id: string }>`
      select id from conversations where id = ${conversationId} and user_id = ${userId}
    `;
    if (!owned[0]) throw new Error("That conversation isn't yours.");
  } else {
    conversationId = crypto.randomUUID();
    const title =
      pref?.auto_title === false
        ? "New chat"
        : data.content.length > 42
          ? `${data.content.slice(0, 41)}…`
          : data.content;
    await sql`
      insert into conversations (id, user_id, title, model_id)
      values (${conversationId}, ${userId}, ${title}, ${model.id})
    `;
    createdConversation = true;
  }

  const history = await sql<{ role: "user" | "assistant"; content: string }>`
    select role, content from messages
    where conversation_id = ${conversationId} and user_id = ${userId} and role in ('user', 'assistant')
    order by created_at desc
    limit 12
  `;

  const length =
    pref?.response_length === "short"
      ? "Keep replies short."
      : pref?.response_length === "long"
        ? "Answer in more depth when it helps."
        : "Match the length to the question.";
  const memory = pref?.memory_enabled
    ? "They opted in to the preferences saved in Settings. Do not invent other memories."
    : "Do not claim you remember anything beyond this chat and their saved name and style.";
  const tools = pref?.confirm_tools === false ? "" : " Ask before suggesting a change that needs their approval.";
  const language =
    pref?.language === "hi" ? " Prefer Hindi unless they write in another language." : pref?.language === "es" ? " Prefer Spanish unless they write in another language." : "";
  const system = `You are Tenro, a personal AI agent. Call the person ${profile[0].preferred_name}. ${styleLine(profile[0].style)} ${length} ${memory}${tools}${language}`;
  const maxTokens =
    pref?.response_length === "short" ? 280 : pref?.response_length === "long" ? 900 : model.capabilities.includes("fast") ? 420 : 700;
  return {
    model,
    apiKey,
    conversationId,
    createdConversation,
    system,
    prior: [...history].reverse(),
    maxTokens,
  };
}

async function insertUser(sql: Sql, userId: string, conversationId: string, content: string) {
  const id = crypto.randomUUID();
  await sql`
    insert into messages (id, conversation_id, user_id, role, content)
    values (${id}, ${conversationId}, ${userId}, 'user', ${content})
  `;
  return id;
}

async function persistAssistant(
  sql: Sql,
  userId: string,
  prepared: Prepared,
  userMessageId: string,
  content: string,
  answer: string,
) {
  const assistantId = crypto.randomUUID();
  await sql`
    insert into messages (id, conversation_id, user_id, role, content, model_id)
    values (${assistantId}, ${prepared.conversationId}, ${userId}, 'assistant', ${answer}, ${prepared.model.id})
  `;
  await sql`
    update conversations set model_id = ${prepared.model.id}, updated_at = now()
    where id = ${prepared.conversationId} and user_id = ${userId}
  `;
  await sql`
    insert into usage_records (id, user_id, model_id)
    values (${crypto.randomUUID()}, ${userId}, ${prepared.model.id})
  `;
  const conversation = await sql<{ id: string; title: string; model_id: string; pinned: boolean }>`
    select id, title, model_id, pinned from conversations
    where id = ${prepared.conversationId} and user_id = ${userId}
  `;
  return {
    conversation: conversation[0],
    user: { id: userMessageId, role: "user" as const, content, model_id: null },
    assistant: { id: assistantId, role: "assistant" as const, content: answer, model_id: prepared.model.id },
  };
}

async function cleanupFailedTurn(sql: Sql, userId: string, prepared: Prepared, userMessageId: string | null) {
  if (userMessageId) {
    await sql`delete from messages where id = ${userMessageId} and user_id = ${userId}`;
  }
  if (prepared.createdConversation) {
    await sql`delete from conversations where id = ${prepared.conversationId} and user_id = ${userId}`;
  }
}

function parseArgs(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function executeTool(
  sql: Sql,
  userId: string,
  runId: string,
  call: ToolCall,
): Promise<{ output: string; activity: string; approval: { id: string; detail: string } | null }> {
  if (call.name === "clock") {
    const now = new Date().toISOString();
    await sql`
      insert into agent_steps (id, run_id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${runId}, ${userId}, 'tool', ${"Read the clock."})
    `;
    return { output: JSON.stringify({ utc: now }), activity: "Read the clock.", approval: null };
  }
  if (call.name === "list_projects") {
    const projects = await sql<{ name: string }>`
      select name from projects where user_id = ${userId} order by created_at desc limit 20
    `;
    await sql`
      insert into agent_steps (id, run_id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${runId}, ${userId}, 'tool', ${"Listed projects."})
    `;
    return {
      output: JSON.stringify({ projects: projects.map((item) => item.name) }),
      activity: "Listed your projects.",
      approval: null,
    };
  }
  if (call.name === "create_project") {
    const name = typeof parseArgs(call.arguments).name === "string" ? String(parseArgs(call.arguments).name).trim().slice(0, 60) : "";
    if (name.length < 2) {
      return { output: JSON.stringify({ error: "A project name needs at least 2 characters." }), activity: "Rejected an empty project name.", approval: null };
    }
    const id = crypto.randomUUID();
    await sql`
      insert into approvals (id, user_id, run_id, tool_id, payload, status)
      values (${id}, ${userId}, ${runId}, 'create_project', ${JSON.stringify({ name })}, 'pending')
    `;
    await sql`
      insert into notifications (id, user_id, kind, body)
      values (${crypto.randomUUID()}, ${userId}, 'approval', ${`Approve a project named ${name}?`})
    `;
    await sql`
      insert into agent_steps (id, run_id, user_id, kind, detail)
      values (${crypto.randomUUID()}, ${runId}, ${userId}, 'approval', ${`Waiting to create “${name}”.`})
    `;
    return {
      output: JSON.stringify({ status: "pending_approval", name, note: "The project was not created." }),
      activity: `Waiting for you to approve “${name}”.`,
      approval: { id, detail: name },
    };
  }
  return { output: JSON.stringify({ error: "That tool is not available." }), activity: "Skipped an unknown tool.", approval: null };
}

async function answerAgent(sql: Sql, userId: string, prepared: Prepared, content: string) {
  const runId = crypto.randomUUID();
  await sql`
    insert into agent_runs (id, user_id, conversation_id, goal, status)
    values (${runId}, ${userId}, ${prepared.conversationId}, ${content}, 'running')
  `;
  const activity: string[] = [];
  let pendingApproval: { id: string; detail: string } | null = null;
  const turns = [...prepared.prior, { role: "user" as const, content }];
  try {
    if (!openAiBase(prepared.model.provider_id)) {
      const projects = await sql<{ name: string }>`
        select name from projects where user_id = ${userId} order by created_at desc limit 8
      `;
      const note = ` Current time: ${new Date().toISOString()}. Projects: ${projects.map((item) => item.name).join(", ") || "none"}. Do not claim you changed anything. This provider cannot run Tenro tools.`;
      const text = await completeChat({
        providerId: prepared.model.provider_id,
        apiModel: prepared.model.api_model,
        apiKey: prepared.apiKey,
        system: `${prepared.system}${note}`,
        messages: turns,
        maxTokens: prepared.maxTokens,
      });
      activity.push("Answered with the clock and your project names. This provider doesn't run Tenro tools.");
      await sql`update agent_runs set status = 'completed', updated_at = now() where id = ${runId} and user_id = ${userId}`;
      return { text, activity, pendingApproval };
    }

    const first = await completeWithTools({
      providerId: prepared.model.provider_id,
      apiModel: prepared.model.api_model,
      apiKey: prepared.apiKey,
      system: `${prepared.system} You may call clock, list_projects, and create_project. create_project only requests approval and does not create anything. Never claim a project exists unless a tool result says the user already approved it.`,
      messages: turns,
      maxTokens: prepared.maxTokens,
      tools: AGENT_TOOLS,
    });
    if (first.unsupported || first.calls.length === 0) {
      const text =
        first.text ||
        (await completeChat({
          providerId: prepared.model.provider_id,
          apiModel: prepared.model.api_model,
          apiKey: prepared.apiKey,
          system: prepared.system,
          messages: turns,
          maxTokens: prepared.maxTokens,
        }));
      if (first.unsupported) activity.push("This model didn't accept tools, so Tenro answered without them.");
      await sql`update agent_runs set status = 'completed', updated_at = now() where id = ${runId} and user_id = ${userId}`;
      return { text, activity, pendingApproval };
    }

    const results: { id: string; content: string }[] = [];
    for (const call of first.calls) {
      const executed = await executeTool(sql, userId, runId, call);
      results.push({ id: call.id, content: executed.output });
      activity.push(executed.activity);
      if (executed.approval) pendingApproval = executed.approval;
    }
    const text = await completeAfterTools({
      providerId: prepared.model.provider_id,
      apiModel: prepared.model.api_model,
      apiKey: prepared.apiKey,
      system: prepared.system,
      messages: turns,
      calls: first.calls,
      results,
      maxTokens: prepared.maxTokens,
    });
    await sql`update agent_runs set status = 'completed', updated_at = now() where id = ${runId} and user_id = ${userId}`;
    return { text, activity, pendingApproval };
  } catch (error) {
    await sql`update agent_runs set status = 'failed', updated_at = now() where id = ${runId} and user_id = ${userId}`;
    throw error;
  }
}

export async function runChat(userId: string, data: ChatRequest): Promise<SavedReply> {
  const sql = await getSql();
  const prepared = await prepareChat(sql, userId, data);
  const userMessageId = await insertUser(sql, userId, prepared.conversationId, data.content);
  try {
    let answer = "";
    let activity: string[] = [];
    let pendingApproval: { id: string; detail: string } | null = null;
    if (data.mode === "agent") {
      const agent = await answerAgent(sql, userId, prepared, data.content);
      answer = agent.text;
      activity = agent.activity;
      pendingApproval = agent.pendingApproval;
    } else {
      answer = await completeChat({
        providerId: prepared.model.provider_id,
        apiModel: prepared.model.api_model,
        apiKey: prepared.apiKey,
        system: prepared.system,
        messages: [...prepared.prior, { role: "user", content: data.content }],
        maxTokens: prepared.maxTokens,
      });
    }
    const saved = await persistAssistant(sql, userId, prepared, userMessageId, data.content, answer);
    return { ...saved, activity, pendingApproval };
  } catch (error) {
    const approvals = await sql<{ id: string }>`
      select id from approvals where user_id = ${userId} and run_id in (
        select id from agent_runs where conversation_id = ${prepared.conversationId} and user_id = ${userId} and status = 'failed'
      )
    `;
    if (!approvals[0]) await cleanupFailedTurn(sql, userId, prepared, userMessageId);
    throw error instanceof Error ? error : new Error("Tenro couldn't answer just now.");
  }
}

export async function regenerateReply(userId: string, conversationId: string): Promise<SavedReply> {
  const sql = await getSql();
  const owned = await sql<{ model_id: string }>`
    select model_id from conversations where id = ${conversationId} and user_id = ${userId}
  `;
  if (!owned[0]) throw new Error("That conversation isn't yours.");
  const tail = await sql<{ id: string; role: string; content: string }>`
    select id, role, content from messages
    where conversation_id = ${conversationId} and user_id = ${userId}
    order by created_at desc
    limit 2
  `;
  const latest = tail[0];
  const previous = tail[1];
  if (!latest || latest.role !== "assistant" || !previous || previous.role !== "user") {
    throw new Error("There's no reply to try again.");
  }
  await sql`delete from messages where id = ${latest.id} and user_id = ${userId}`;
  const prepared = await prepareChat(sql, userId, {
    content: previous.content,
    modelId: owned[0].model_id,
    conversationId,
    mode: "chat",
  });
  try {
    const answer = await completeChat({
      providerId: prepared.model.provider_id,
      apiModel: prepared.model.api_model,
      apiKey: prepared.apiKey,
      system: prepared.system,
      messages: prepared.prior,
      maxTokens: prepared.maxTokens,
    });
    const saved = await persistAssistant(sql, userId, prepared, previous.id, previous.content, answer);
    return { ...saved, activity: [], pendingApproval: null };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Tenro couldn't answer just now.");
  }
}

export async function editLatestAndReply(userId: string, conversationId: string, content: string): Promise<SavedReply> {
  const sql = await getSql();
  const owned = await sql<{ model_id: string }>`
    select model_id from conversations where id = ${conversationId} and user_id = ${userId}
  `;
  if (!owned[0]) throw new Error("That conversation isn't yours.");
  const tail = await sql<{ id: string; role: string }>`
    select id, role from messages
    where conversation_id = ${conversationId} and user_id = ${userId}
    order by created_at desc
    limit 2
  `;
  const latest = tail[0];
  if (!latest) throw new Error("There's nothing to edit.");
  const userMessage = latest.role === "user" ? latest : tail[1];
  if (!userMessage || (latest.role === "assistant" && tail[1]?.role !== "user") || (latest.role !== "user" && latest.role !== "assistant")) {
    throw new Error("Only the latest message can be edited.");
  }
  if (latest.role === "assistant") {
    await sql`delete from messages where id = ${latest.id} and user_id = ${userId}`;
  }
  await sql`
    update messages set content = ${content}
    where id = ${userMessage.id} and user_id = ${userId} and role = 'user'
  `;
  const prepared = await prepareChat(sql, userId, {
    content,
    modelId: owned[0].model_id,
    conversationId,
    mode: "chat",
  });
  const answer = await completeChat({
    providerId: prepared.model.provider_id,
    apiModel: prepared.model.api_model,
    apiKey: prepared.apiKey,
    system: prepared.system,
    messages: prepared.prior,
    maxTokens: prepared.maxTokens,
  });
  const saved = await persistAssistant(sql, userId, prepared, userMessage.id, content, answer);
  return { ...saved, activity: [], pendingApproval: null };
}

export async function streamProvider(prepared: Prepared, content: string) {
  const base = openAiBase(prepared.model.provider_id);
  if (!base) return null;
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${prepared.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: prepared.model.api_model,
      max_tokens: prepared.maxTokens,
      stream: true,
      messages: [
        { role: "system", content: prepared.system },
        ...prepared.prior.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content },
      ],
    }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("The provider rejected the saved key.");
  if (response.status === 429) throw new Error("The provider is rate limiting this key. Try again shortly.");
  if (!response.ok || !response.body) throw new Error("The provider couldn't answer just now.");
  return response;
}

export { insertUser, persistAssistant, cleanupFailedTurn };
