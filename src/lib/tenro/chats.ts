import { resolveModelId } from "@/lib/tenro/models";

export const CHATS_KEY = "tenro.chats";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  files?: string[];
  model?: string;
};

export type Chat = {
  id: string;
  title: string;
  updatedAt: number;
  modelId: string;
  pinned?: boolean;
  projectId?: string | null;
  messages: ChatMessage[];
};

export function loadChats(): Chat[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Partial<Chat>[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages))
      .map((chat) => {
        const messages = (chat.messages as ChatMessage[]) ?? [];
        const fromMessage = [...messages].reverse().find((message) => typeof message.model === "string")?.model;
        const stored = typeof chat.modelId === "string" ? chat.modelId : fromMessage;
        return {
          id: chat.id as string,
          title: typeof chat.title === "string" ? chat.title : "Chat",
          updatedAt: typeof chat.updatedAt === "number" ? chat.updatedAt : Date.now(),
          modelId: resolveModelId(stored),
          messages,
        };
      });
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]) {
  const trimmed = chats.slice(0, 24).map((chat) => ({
    ...chat,
    modelId: resolveModelId(chat.modelId),
    messages: chat.messages.slice(-40),
  }));
  localStorage.setItem(CHATS_KEY, JSON.stringify(trimmed));
}

export function chatTitle(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= 42) return line;
  return `${line.slice(0, 41)}…`;
}
