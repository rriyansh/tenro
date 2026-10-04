import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUp,
  Archive,
  Bell,
  Bot,
  FileText,
  FolderKanban,
  Menu,
  Paperclip,
  Pin,
  Plug,
  Plus,
  Settings,
  Shield,
  X,
} from "lucide-react";
import smileUrl from "@/assets/tenro-smile.png";
import thinkUrl from "@/assets/tenro-think.png";
import curiousUrl from "@/assets/tenro-curious.png";
import { AccountSheets, ApprovalList } from "@/components/tenro/account-sheets";
import { Markdown } from "@/components/tenro/markdown";
import { Sheet } from "@/components/tenro/sheet";
import { ModelBrowser } from "@/components/tenro/model-picker";
import { TenroMark } from "@/components/tenro/mark";
import { SettingsCenter } from "@/components/tenro/settings-center";
import { Button } from "@/components/ui/button";
import { type Profile } from "@/lib/profile";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  archiveConversation,
  deleteConversation,
  deleteCredential,
  deleteFile,
  deleteMessage,
  editLatestMessage,
  listConversations,
  listCredentials,
  listFiles,
  listMessages,
  pinConversation,
  readFile,
  regenerateMessage,
  renameConversation,
  getSettings,
  saveCredential,
  saveDocument,
  saveFile,
  sendMessage,
  setConversationModel,
} from "@/lib/tenro/api";
import { type Chat, type ChatMessage } from "@/lib/tenro/chats";
import {
  getModel,
  getProvider,
  modelLabel,
  PROVIDERS,
  resolveModelId,
  type ProviderId,
} from "@/lib/tenro/models";
import { applyDocumentSettings, DEFAULT_SETTINGS, mapSettings, type AvatarId, type UserSettings } from "@/lib/tenro/settings";
import { streamChat, StreamFallback } from "@/lib/tenro/stream-client";

const PROMPTS = [
  { title: "Help me build a website", line: "A first version you can shape." },
  { title: "Explain something", line: "A clear pass, in your words." },
  { title: "Analyze a file", line: "Attach a text file, then ask." },
  { title: "Plan a project", line: "The next steps, in order." },
];

const AGENTS = [
  { id: "builder", name: "Builder", line: "Turns an idea into something you can ship.", prompt: "Help me build a website" },
  { id: "explainer", name: "Explainer", line: "Makes a hard idea easy to follow.", prompt: "Explain something" },
  { id: "planner", name: "Planner", line: "Breaks a project into the next steps.", prompt: "Plan a project" },
  { id: "reader", name: "Reader", line: "Reads a text file with you.", prompt: "Analyze a file" },
];

type Panel =
  | "models"
  | "agents"
  | "providers"
  | "connectors"
  | "files"
  | "settings"
  | "profile"
  | "projects"
  | "usage"
  | "security"
  | "notifications"
  | "archived"
  | null;
type Attachment = { id: string; name: string; text: string };

type WorkspaceProps = {
  profile: Profile;
  initialModelId: string;
  role: string;
  onProfileChange: (profile: Profile) => void;
  onDefaultModel: (modelId: string) => void;
  onDataCleared: () => void;
};

export function Workspace({ profile, initialModelId, role, onProfileChange, onDefaultModel, onDataCleared }: WorkspaceProps) {
  const askId = useId();
  const fileId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [connectFor, setConnectFor] = useState<ProviderId | null>(null);
  const [connectedIds, setConnectedIds] = useState<string[]>(["xai"]);
  const [storedFiles, setStoredFiles] = useState<{ id: string; name: string; size_bytes: number }[]>([]);
  const [keyHints, setKeyHints] = useState<Record<string, string>>({});
  const [liveText, setLiveText] = useState("");
  const [editing, setEditing] = useState("");
  const [mode, setMode] = useState<"chat" | "agent">("chat");
  const [wide, setWide] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [draftModelId, setDraftModelId] = useState(initialModelId);
  const [prefs, setPrefs] = useState<UserSettings>(DEFAULT_SETTINGS);
  const account = useCurrentUser();

  const active = chats.find((chat) => chat.id === activeId) ?? null;
  const thinking = pendingId !== null;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, thinking, liveText]);

  useEffect(() => {
    if (!sidebar) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebar(false);
    }
    window.addEventListener("keydown", onKey);
    document.querySelector<HTMLButtonElement>(".drawer button[aria-label='Close menu']")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebar]);

  function commit(next: Chat[]) {
    setChats(next);
  }

  useEffect(() => {
    let stop = false;
    listConversations()
      .then((rows) => {
        if (stop) return;
        setChats(
          rows.map((row) => ({
            id: row.id,
            title: row.title,
            modelId: row.model_id,
            pinned: row.pinned,
            projectId: row.project_id,
            updatedAt: Date.parse(row.updated_at) || Date.now(),
            messages: [],
          })),
        );
      })
      .catch((caught) => {
        if (!stop) setNotice(caught instanceof Error ? caught.message : "Couldn't load chats.");
      });
    listCredentials()
      .then((rows) => {
        if (stop) return;
        setConnectedIds(["xai", ...rows.map((row) => row.provider_id)]);
        setKeyHints(Object.fromEntries(rows.map((row) => [row.provider_id, row.hint])));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    let stop = false;
    getSettings()
      .then((row) => {
        if (!stop) setPrefs(mapSettings(row));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    applyDocumentSettings(prefs, profile.appearance);
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => applyDocumentSettings(prefs, profile.appearance);
    dark.addEventListener("change", apply);
    reduce.addEventListener("change", apply);
    return () => {
      dark.removeEventListener("change", apply);
      reduce.removeEventListener("change", apply);
    };
  }, [prefs, profile.appearance]);

  useEffect(() => {
    if (panel !== "files") return;
    let stop = false;
    listFiles()
      .then((rows) => {
        if (!stop) setStoredFiles(rows);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [panel]);

  function openPanel(next: Panel) {
    setSidebar(false);
    setPanel(next);
  }

  function openModels() {
    setSidebar(false);
    setConnectFor(null);
    setPanel((current) => (current === "models" ? null : "models"));
  }

  function pickModel(id: string) {
    const next = getModel(id);
    if (!next || next.status !== "available") return;
    if (active) {
      commit(chats.map((chat) => (chat.id === active.id ? { ...chat, modelId: next.id } : chat)));
      void setConversationModel({ data: { id: active.id, modelId: next.id } }).catch((caught) => {
        setNotice(caught instanceof Error ? caught.message : "Couldn't switch models.");
      });
    } else {
      setDraftModelId(next.id);
    }
    const linked = connectedIds.includes(next.provider) || next.provider === "xai";
    if (!linked) setNotice(`Connect ${getProvider(next.provider).name} before sending with ${next.name}.`);
    else setNotice("");
  }

  async function openChat(id: string) {
    setActiveId(id);
    setSidebar(false);
    setNotice("");
    try {
      const rows = await listMessages({ data: { conversationId: id } });
      setChats((current) =>
        current.map((chat) =>
          chat.id === id
            ? {
                ...chat,
                messages: rows.map((row) => ({
                  id: row.id,
                  role: row.role === "assistant" ? "assistant" : "user",
                  text: row.content,
                  model: row.model_id ?? undefined,
                })),
              }
            : chat,
        ),
      );
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Couldn't open that chat.");
    }
  }

  function placePrompt(value: string) {
    setText(value);
    setPanel(null);
    setSidebar(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startFresh() {
    if (pendingId) return;
    setActiveId(null);
    setText("");
    setFiles([]);
    setNotice("");
    setSidebar(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    const next: Attachment[] = [];
    for (const file of Array.from(list).slice(0, 3)) {
      const textFile = file.type.startsWith("text/") || /\.(txt|md|csv|json|text)$/i.test(file.name);
      if (!textFile) {
        setNotice("Tenro can read text files for now.");
        continue;
      }
      if (file.size > 200_000) {
        setNotice(`${file.name} is too large. Keep it under 200 KB.`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), name: file.name, text: (await file.text()).slice(0, 8000) });
    }
    if (next.length) {
      setFiles((current) => [...current, ...next].slice(0, 3));
      setNotice("");
    }
  }

  async function send(raw: string) {
    const value = raw.trim();
    if (!value || pendingId) return;
    const chosen = getModel(activeModelId);
    if (!chosen || chosen.status !== "available") {
      setNotice("Pick an available model.");
      setPanel("models");
      return;
    }
    const linked = connectedIds.includes(chosen.provider) || chosen.provider === "xai";
    if (!linked) {
      setNotice(`Connect ${getProvider(chosen.provider).name} before sending with ${chosen.name}.`);
      setConnectFor(chosen.provider);
      setPanel("models");
      return;
    }
    const chatId = active?.id ?? "pending";
    const fileBlock = files.map((file) => `File ${file.name}:\n${file.text}`).join("\n\n");
    const content = fileBlock ? `${value}\n\n${fileBlock}`.slice(0, 4000) : value;
    setText("");
    setFiles([]);
    setNotice("");
    setPendingId(chatId);
    if (inputRef.current) inputRef.current.style.height = "auto";
    const apply = (result: {
      conversation: { id: string; title: string; model_id: string; pinned: boolean };
      user: { id: string };
      assistant: { id: string; content: string; model_id: string };
      activity?: string[];
      pendingApproval?: { detail: string } | null;
    }) => {
      const userMessage: ChatMessage = {
        id: result.user.id,
        role: "user",
        text: value,
        files: files.map((file) => file.name),
      };
      const answer: ChatMessage = {
        id: result.assistant.id,
        role: "assistant",
        text: result.assistant.content,
        model: result.assistant.model_id,
      };
      setChats((current) => {
        const existing = current.find((chat) => chat.id === result.conversation.id);
        const nextChat: Chat = {
          id: result.conversation.id,
          title: result.conversation.title,
          modelId: result.conversation.model_id,
          pinned: result.conversation.pinned,
          updatedAt: Date.now(),
          messages: existing ? [...existing.messages, userMessage, answer] : [userMessage, answer],
        };
        return [nextChat, ...current.filter((chat) => chat.id !== result.conversation.id)];
      });
      setActiveId(result.conversation.id);
      if (result.pendingApproval) setNotice(`Waiting for approval to create “${result.pendingApproval.detail}”.`);
      else if (result.activity && result.activity.length > 0) setNotice(result.activity.join(" "));
    };
    try {
      await Promise.all(files.map((file) => saveFile({ data: { name: file.name, body: file.text } })));
      const openaiLike = ["xai", "openai", "deepseek", "longcat"].includes(chosen.provider);
      if (mode === "chat" && openaiLike && prefs.streaming) {
        try {
          const streamed = await streamChat(
            { text: content, modelId: chosen.id, conversationId: active?.id ?? null },
            setLiveText,
          );
          apply(streamed);
          return;
        } catch (error) {
          if (!(error instanceof StreamFallback)) throw error;
        }
      }
      const result = await sendMessage({
        data: {
          text: content,
          modelId: chosen.id,
          conversationId: active?.id ?? null,
          mode,
        },
      });
      apply(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Tenro couldn't answer just now.");
      setText(value);
    } finally {
      setPendingId(null);
      setLiveText("");
    }
  }

  async function refreshChat(id: string) {
    const rows = await listMessages({ data: { conversationId: id } });
    setChats((current) =>
      current.map((chat) =>
        chat.id === id
          ? {
              ...chat,
              messages: rows.map((row) => ({
                id: row.id,
                role: row.role === "assistant" ? "assistant" : "user",
                text: row.content,
                model: row.model_id ?? undefined,
              })),
            }
          : chat,
      ),
    );
  }

  async function retry() {
    if (!active || pendingId) return;
    setPendingId(active.id);
    setNotice("");
    try {
      await regenerateMessage({ data: { conversationId: active.id } });
      await refreshChat(active.id);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Couldn't try that again.");
    } finally {
      setPendingId(null);
    }
  }

  async function saveEdit() {
    if (!active || pendingId) return;
    const content = editing.trim();
    if (!content) return;
    setPendingId(active.id);
    setNotice("");
    try {
      await editLatestMessage({ data: { conversationId: active.id, text: content } });
      setEditing("");
      await refreshChat(active.id);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Couldn't update that message.");
    } finally {
      setPendingId(null);
    }
  }

  const activeModelId = active?.modelId ? resolveModelId(active.modelId) : draftModelId;
  const activeModel = getModel(activeModelId) ?? getModel("xai/grok-4.3")!;
  const activeReady =
    activeModel.status === "available" && (connectedIds.includes(activeModel.provider) || activeModel.provider === "xai");
  const showModels = panel === "models";

  return (
    <div className="grove h-dvh" data-appearance={profile.appearance}>
      <div className="shell relative flex h-dvh flex-col">
        <header className="safe-top relative flex items-center gap-1 px-3 pt-2 pb-2">
          <button type="button" className="icon-btn tap" aria-label="Open menu" aria-expanded={sidebar} onClick={() => setSidebar(true)}>
            <Menu className="size-5" strokeWidth={2} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <TenroMark className="size-7" />
            <p className="brand-type truncate text-base font-semibold tracking-tight">Tenro</p>
          </div>
          <button type="button" className="model-chip tap ml-auto" key={activeModel.id} aria-label={`Model, ${activeModel.name}`} onClick={openModels}>
            {activeModel.name}
          </button>
          <button type="button" className="icon-btn tap" aria-label="Notifications" onClick={() => openPanel("notifications")}>
            <Bell className="size-5" strokeWidth={2} />
          </button>
          <button type="button" className="avatar tap" aria-label={`Profile, ${profile.preferredName}`} onClick={() => openPanel("profile")}>
            {initials(profile.preferredName)}
          </button>
        </header>

        <div ref={scroller} className="thread min-h-0 flex-1 overflow-y-auto px-4">
          {(active && active.messages.length > 0) || thinking || liveText ? (
            <div key={active?.id ?? "live"} className="thread-in flex flex-col gap-3 py-3">
              {(active?.messages ?? []).map((message, index, messages) => {
                const lastUser = [...messages].reverse().find((item) => item.role === "user");
                const canEdit = message.role === "user" && message.id === lastUser?.id && index >= messages.length - 2;
                return (
                  <article key={message.id} className={message.role === "user" ? "msg msg-user" : "msg msg-tenro"}>
                    {message.role === "assistant" ? <AgentFace id={prefs.avatarId} name={profile.preferredName} /> : null}
                    <div className="min-w-0">
                      {message.role === "assistant" ? (
                        <Markdown
                          text={message.text}
                          plain={!prefs.markdown}
                          onSaveCode={(code, language) => {
                            const ext = /^[a-z0-9]+$/i.test(language) ? language.toLowerCase() : "txt";
                            void saveDocument({ data: { name: `snippet.${ext}`, format: "code", body: code } })
                              .then(() => setNotice("Saved that code to your files."))
                              .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't save that code."));
                          }}
                        />
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
                      )}
                      {message.files && message.files.length > 0 ? (
                        <p className="mt-1 text-xs opacity-70">{message.files.join(", ")}</p>
                      ) : null}
                      {message.model ? <p className="mt-1 text-xs text-mist">{modelLabel(message.model)}</p> : null}
                      <div className="msg-actions">
                        <button type="button" className="text-link tap" onClick={() => void navigator.clipboard.writeText(message.text)}>
                          Copy
                        </button>
                        {message.role === "assistant" && active && index === messages.length - 1 ? (
                          <button type="button" className="text-link tap" onClick={() => void retry()}>
                            Try again
                          </button>
                        ) : null}
                        {canEdit ? (
                          <button type="button" className="text-link tap" onClick={() => setEditing(message.text)}>
                            Edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-link tap"
                          onClick={() => {
                            if (!active || !window.confirm("Delete this message?")) return;
                            const chatId = active.id;
                            void deleteMessage({ data: { id: message.id } })
                              .then(() => {
                                setChats((current) =>
                                  current.map((chat) =>
                                    chat.id === chatId ? { ...chat, messages: chat.messages.filter((item) => item.id !== message.id) } : chat,
                                  ),
                                );
                              })
                              .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't delete that message."));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {liveText ? (
                <article className="msg msg-tenro">
                  <TenroMark className="msg-mark" />
                  <Markdown text={liveText} plain={!prefs.markdown} />
                </article>
              ) : null}
              {thinking && !liveText ? <Thinking agent={mode === "agent"} /> : null}
            </div>
          ) : (
            <div className="enter flex min-h-full flex-col justify-center py-6">
              <img src={smileUrl} alt="" className="buddy" width={518} height={900} draggable={false} />
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Hey {profile.preferredName}</h1>
              <p className="mt-1 text-base text-muted">What can I help you with?</p>
              <div className="prompt-grid mt-6">
                {PROMPTS.map((prompt) => (
                  <button key={prompt.title} type="button" className="prompt-card tap" onClick={() => placePrompt(prompt.title)}>
                    <span className="block text-sm font-semibold text-ink">{prompt.title}</span>
                    <span className="mt-1 block text-xs leading-snug text-mist">{prompt.line}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="safe-bottom relative px-3 pt-2">
          {notice ? (
            <p className="mb-2 px-1 text-sm text-ink" role="status">
              {notice}
            </p>
          ) : null}
          {editing ? (
            <form
              className="mb-2 flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              <label className="text-sm font-semibold" htmlFor="edit-message">
                Edit the latest message
              </label>
              <textarea id="edit-message" className="note" value={editing} maxLength={4000} onChange={(event) => setEditing(event.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" disabled={!editing.trim() || Boolean(pendingId)}>
                  Save and reply
                </Button>
                <Button variant="quiet" onClick={() => setEditing("")}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          {!activeReady ? (
            <p className="mb-2 px-1 text-sm text-muted">
              {activeModel.name} is not ready.{" "}
              <button type="button" className="text-link tap" onClick={() => {
                setConnectFor(activeReady ? null : activeModel.provider);
                setPanel("models");
              }}>
                {activeReady ? "Choose another model" : `Connect ${getProvider(activeModel.provider).name}`}
              </button>
            </p>
          ) : null}
          <div className="mb-2 flex gap-2 px-1">
            <button type="button" className={mode === "chat" ? "filter-chip tap on" : "filter-chip tap"} onClick={() => setMode("chat")}>
              Chat
            </button>
            <button type="button" className={mode === "agent" ? "filter-chip tap on" : "filter-chip tap"} onClick={() => setMode("agent")}>
              Agent
            </button>
          </div>
          <form
            className="composer-card"
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
          >
            {files.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-2">
                {files.map((file) => (
                  <li key={file.id} className="file-chip">
                    <FileText className="size-3.5" />
                    <span className="max-w-40 truncate">{file.name}</span>
                    <button type="button" className="tap" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label htmlFor={askId} className="sr-only">
              Ask Tenro anything
            </label>
            <textarea
              id={askId}
              ref={inputRef}
              className="composer-input"
              rows={1}
              value={text}
              maxLength={4000}
              enterKeyHint="send"
              placeholder="Ask Tenro anything…"
              onChange={(event) => {
                setText(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 144)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(text);
                }
              }}
            />
            <div className="mt-1 flex items-center gap-1">
              <input
                id={fileId}
                className="sr-only"
                type="file"
                accept=".txt,.md,.csv,.json,text/plain"
                multiple
                onChange={(event) => {
                  void onPickFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <label htmlFor={fileId} className="icon-btn tap" title="Attach a text file">
                <Paperclip className="size-5" strokeWidth={2} />
                <span className="sr-only">Attach a text file</span>
              </label>
              <button type="button" className="icon-btn tap" aria-label="Tools and connectors" onClick={() => openPanel("connectors")}>
                <Plug className="size-5" strokeWidth={2} />
              </button>
              <button type="button" className="model-chip tap" key={`${activeModel.id}-composer`} aria-label={`Model, ${activeModel.name}`} onClick={openModels}>
                {activeModel.name}
              </button>
              <Button className="send ml-auto" type="submit" disabled={text.trim().length === 0 || Boolean(pendingId)} aria-label="Send">
                <ArrowUp className="size-5" strokeWidth={2.25} />
              </Button>
            </div>
          </form>
        </footer>
      </div>

      <Sidebar
        open={sidebar}
        profile={profile}
        chats={chats}
        activeId={activeId}
        onClose={() => setSidebar(false)}
        onNew={startFresh}
        onOpenChat={openChat}
        onDelete={(id) => {
          if (prefs.confirmDelete && !window.confirm("Delete this chat permanently? Its messages are removed from your account.")) return;
          void deleteConversation({ data: { id } })
            .then(() => {
              setChats((current) => current.filter((chat) => chat.id !== id));
              setActiveId((current) => (current === id ? null : current));
            })
            .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't delete that chat."));
        }}
        onRename={(id, title) => {
          void renameConversation({ data: { id, title } })
            .then(() => setChats((current) => current.map((chat) => (chat.id === id ? { ...chat, title } : chat))))
            .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't rename that chat."));
        }}
        onPin={(id) => {
          void pinConversation({ data: { id } })
            .then((result) =>
              setChats((current) =>
                current
                  .map((chat) => (chat.id === id ? { ...chat, pinned: result.pinned } : chat))
                  .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
              ),
            )
            .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't pin that chat."));
        }}
        onArchive={(id) => {
          void archiveConversation({ data: { id } })
            .then(() => {
              setChats((current) => current.filter((chat) => chat.id !== id));
              setActiveId((current) => (current === id ? null : current));
            })
            .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't archive that chat."));
        }}
        onModels={openModels}
        role={role}
        onPanel={openPanel}
      />

      {showModels ? (
        <ModelBrowser
          wide={wide}
          selectedId={activeModelId}
          connectFor={connectFor}
          connectedIds={connectedIds}
          onClose={() => {
            setPanel(null);
            setConnectFor(null);
          }}
          onBack={() => setConnectFor(null)}
          onSelect={pickModel}
          onConnect={setConnectFor}
          onSaveKey={async (provider, secret) => {
            const saved = await saveCredential({ data: { providerId: provider, secret } });
            setConnectedIds((current) => Array.from(new Set([...current, provider])));
            setKeyHints((current) => ({ ...current, [provider]: saved.hint }));
            return saved.hint;
          }}
        />
      ) : null}

      <Sheet
        open={panel === "agents"}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Agents"
        description="A starting point. Agent mode can read the clock and your projects, and it asks before creating one."
      >
        <div className="flex flex-col gap-2">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="stack-row tap"
              onClick={() => {
                setActiveId(null);
                setFiles([]);
                placePrompt(agent.prompt);
              }}
            >
              <Bot className="size-5 text-mist" />
              <span>
                <span className="block text-sm font-semibold">{agent.name}</span>
                <span className="block text-xs text-mist">{agent.line}</span>
              </span>
            </button>
          ))}
          <ApprovalList />
        </div>
      </Sheet>

      <Sheet
        open={panel === "providers"}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Providers"
        description="Keys are checked with the provider, then stored encrypted."
      >
        <div className="flex flex-col gap-2">
          {PROVIDERS.map((provider) => {
            const connected = connectedIds.includes(provider.id) || provider.auth === "tenro";
            if (connected) {
              return (
                <div key={provider.id} className="stack-row">
                  <Plug className="size-5 text-mist" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{provider.name}</span>
                    <span className="block text-xs text-mist">
                      {provider.auth === "tenro"
                        ? keyHints[provider.id]
                          ? `Your key is saved (${keyHints[provider.id]}). Tenro can still answer if you remove it.`
                          : "Tenro can answer with xAI."
                        : `Your key is saved (${keyHints[provider.id] ?? "saved"}).`}
                    </span>
                  </span>
                  {provider.auth !== "tenro" || keyHints[provider.id] ? (
                    <button
                      type="button"
                      className="text-link tap"
                      onClick={() => {
                        void deleteCredential({ data: { providerId: provider.id } })
                          .then(() => {
                            setKeyHints((current) => {
                              const next = { ...current };
                              delete next[provider.id];
                              return next;
                            });
                            if (provider.auth !== "tenro") {
                              setConnectedIds((current) => current.filter((id) => id !== provider.id));
                            }
                          })
                          .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't remove that key."));
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              );
            }
            return (
              <button
                key={provider.id}
                type="button"
                className="stack-row tap"
                onClick={() => {
                  setConnectFor(provider.id);
                  setPanel("models");
                }}
              >
                <Plug className="size-5 text-mist" />
                <span>
                  <span className="block text-sm font-semibold">{provider.name}</span>
                  <span className="block text-xs text-mist">Not connected. Add a key.</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet
        open={panel === "files"}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Files"
        description="Text you attach is saved to your account."
      >
        <div className="flex flex-col gap-3">
          {storedFiles.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">No saved files yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {storedFiles.map((file) => (
                <li key={file.id} className="stack-row">
                  <FileText className="size-5 text-mist" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {file.name}
                    <span className="block text-xs text-mist">{file.size_bytes} characters</span>
                  </span>
                  <button
                    type="button"
                    className="text-link tap"
                    onClick={() => {
                      void readFile({ data: { id: file.id } })
                        .then((saved) => {
                          setFiles((current) => [...current, { id: saved.id, name: saved.name, text: saved.body.slice(0, 8000) }].slice(0, 3));
                          setPanel(null);
                        })
                        .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't open that file."));
                    }}
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    className="text-link tap"
                    onClick={() => {
                      void deleteFile({ data: { id: file.id } })
                        .then(() => setStoredFiles((current) => current.filter((item) => item.id !== file.id)))
                        .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't delete that file."));
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button
            onClick={() => {
              setPanel(null);
              document.getElementById(fileId)?.click();
            }}
          >
            Attach a file
          </Button>
        </div>
      </Sheet>

      {panel === "settings" ? (
        <SettingsCenter
          profile={profile}
          email={account?.primaryEmail ?? null}
          role={role}
          defaultModelId={draftModelId}
          prefs={prefs}
          onClose={() => setPanel(null)}
          onProfileChange={onProfileChange}
          onPrefs={setPrefs}
          onDefaultModel={(modelId) => {
            setDraftModelId(modelId);
            onDefaultModel(modelId);
          }}
          onCleared={onDataCleared}
          onChatsCleared={() => {
            setChats([]);
            setActiveId(null);
          }}
          onOpenArchived={() => setPanel("archived")}
          onOpenMenu={() => {
            setPanel(null);
            setSidebar(true);
          }}
          onCredential={(providerId, hint) => {
            if (hint) {
              setConnectedIds((current) => Array.from(new Set([...current, providerId])));
              setKeyHints((current) => ({ ...current, [providerId]: hint }));
            } else {
              setKeyHints((current) => {
                const next = { ...current };
                delete next[providerId];
                return next;
              });
              if (providerId !== "xai") setConnectedIds((current) => current.filter((id) => id !== providerId));
            }
          }}
        />
      ) : null}

      <Sheet
        open={panel === "profile"}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title={profile.preferredName}
        description={profile.name}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Tenro calls you {profile.preferredName}. Chats and keys are stored for this account.
          </p>
          <UserButton />
          <Button variant="quiet" className="w-full" onClick={() => setPanel("usage")}>
            Usage
          </Button>
          <Button variant="quiet" className="w-full" onClick={() => setPanel("security")}>
            Security
          </Button>
          <Button variant="quiet" className="w-full" onClick={() => setPanel("settings")}>
            Settings
          </Button>
          <a className="btn-quiet tap inline-flex w-full items-center justify-center rounded-full text-sm font-medium" href="/tenro-source.zip" download="tenro-source.zip">
            Download source code
          </a>
          {role === "admin" ? (
            <a className="text-link" href="/admin">
              Admin
            </a>
          ) : (
            <p className="text-xs text-mist">This account is not an administrator.</p>
          )}
        </div>
      </Sheet>
      <AccountSheets
        panel={panel}
        onClose={() => setPanel(null)}
        conversationId={active?.id ?? null}
        defaultModelId={draftModelId}
        onDefaultModel={(modelId) => {
          setDraftModelId(modelId);
          onDefaultModel(modelId);
        }}
        onCleared={onDataCleared}
        onRestored={() => {
          void listConversations()
            .then((rows) => {
              setChats((current) => {
                const messages = new Map(current.map((chat) => [chat.id, chat.messages]));
                return rows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  modelId: row.model_id,
                  pinned: row.pinned,
                  projectId: row.project_id,
                  updatedAt: Date.parse(row.updated_at) || Date.now(),
                  messages: messages.get(row.id) ?? [],
                }));
              });
            })
            .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Couldn't refresh chats."));
        }}
      />
    </div>
  );
}

function Thinking({ agent = false }: { agent?: boolean }) {
  return (
    <div className="msg msg-tenro" role="status" aria-live="polite">
      <img src={thinkUrl} alt="" className="think-face" width={600} height={899} />
      <div>
        <p className="text-sm text-muted">{agent ? "Tenro is working" : "Tenro is thinking"}</p>
        <span className="think-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

function Sidebar({
  open,
  profile,
  chats,
  activeId,
  onClose,
  onNew,
  onOpenChat,
  onDelete,
  onRename,
  onPin,
  onArchive,
  onModels,
  role,
  onPanel,
}: {
  open: boolean;
  profile: Profile;
  chats: Chat[];
  activeId: string | null;
  onClose: () => void;
  onNew: () => void;
  onOpenChat: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onModels: () => void;
  role: string;
  onPanel: (panel: Panel) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = chats.filter((chat) => chat.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      {open ? <button type="button" className="drawer-backdrop" aria-label="Close menu" onClick={onClose} /> : null}
      <aside className={open ? "drawer open" : "drawer"} aria-hidden={!open} inert={open ? undefined : true}>
        <div className="flex items-center gap-2 px-3 pt-4">
          <TenroMark className="size-7" />
          <p className="brand-type text-base font-semibold">Tenro</p>
          <button type="button" className="icon-btn tap ml-auto" aria-label="Close menu" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="drawer-scroll">
          <button type="button" className="side-link tap" onClick={onNew}>
            <Plus className="size-5" />
            New chat
          </button>
          <label className="sr-only" htmlFor="chat-search">
            Search chats
          </label>
          <input
            id="chat-search"
            className="field mx-1 mb-2"
            style={{ height: "2.75rem", width: "calc(100% - 0.5rem)" }}
            placeholder="Search recent chats"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="drawer-label">Chat history</p>
          {shown.length === 0 ? (
            <p className="px-3 text-sm text-mist">{chats.length === 0 ? "No chats yet." : "No matching chats."}</p>
          ) : (
            shown.map((chat) => (
              <div key={chat.id}>
                <div className="flex items-center">
                  <button
                    type="button"
                    className={chat.id === activeId ? "side-link tap on" : "side-link tap"}
                    onClick={() => onOpenChat(chat.id)}
                  >
                    <span className="truncate">{chat.pinned ? "Pinned · " : ""}{chat.title}</span>
                  </button>
                </div>
                {chat.id === activeId ? (
                  <div className="mb-1 flex gap-1 px-2">
                    <button type="button" className="icon-btn tap" aria-label={chat.pinned ? "Unpin chat" : "Pin chat"} onClick={() => onPin(chat.id)}>
                      <Pin className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn tap"
                      aria-label="Rename chat"
                      onClick={() => {
                        const next = window.prompt("Rename chat", chat.title);
                        if (next && next.trim()) onRename(chat.id, next.trim().slice(0, 80));
                      }}
                    >
                      <span className="text-xs font-semibold">Aa</span>
                    </button>
                    <button type="button" className="icon-btn tap" aria-label="Archive chat" onClick={() => onArchive(chat.id)}>
                      <Archive className="size-4" />
                    </button>
                    <button type="button" className="icon-btn tap" aria-label="Delete chat" onClick={() => onDelete(chat.id)}>
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
          <button type="button" className="side-link tap" onClick={() => onPanel("archived")}>
            <Archive className="size-5" />
            Archived
          </button>
          <p className="drawer-label">Workspace</p>
          <button type="button" className="side-link tap" onClick={onModels}>
            <TenroMark className="size-5" />
            AI models
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("agents")}>
            <Bot className="size-5" />
            Agents
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("providers")}>
            <Plug className="size-5" />
            Providers
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("connectors")}>
            <Plug className="size-5" />
            Connectors
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("files")}>
            <FileText className="size-5" />
            Files
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("projects")}>
            <FolderKanban className="size-5" />
            Projects
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("usage")}>
            <Settings className="size-5" />
            Usage
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("security")}>
            <Shield className="size-5" />
            Security
          </button>
          <button type="button" className="side-link tap" onClick={() => onPanel("settings")}>
            <Settings className="size-5" />
            Settings
          </button>
          <a className="side-link tap" href="/tenro-source.zip" download="tenro-source.zip">
            <FileText className="size-5" />
            Download source
          </a>
          {role === "admin" ? (
            <a className="side-link tap" href="/admin">
              <Shield className="size-5" />
              Admin
            </a>
          ) : null}
        </div>
        <button type="button" className="profile-row tap" onClick={() => onPanel("profile")}>
          <span className="avatar">{initials(profile.preferredName)}</span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-semibold">{profile.preferredName}</span>
            <span className="block truncate text-xs text-mist">{profile.name}</span>
          </span>
        </button>
      </aside>
    </>
  );
}


function AgentFace({ id, name }: { id: AvatarId; name: string }) {
  if (id === "smile") return <img src={smileUrl} alt="" className="msg-mark object-contain" />;
  if (id === "think") return <img src={thinkUrl} alt="" className="msg-mark object-contain" />;
  if (id === "curious") return <img src={curiousUrl} alt="" className="msg-mark object-contain" />;
  if (id === "initials") return <span className="avatar">{initials(name)}</span>;
  return <TenroMark className="msg-mark" />;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "T";
}
