import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sheet } from "@/components/tenro/sheet";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  adminListFlags,
  adminListModels,
  adminOverview,
  assignProject,
  clearAccountData,
  createProject,
  decideApproval,
  deleteProject,
  health,
  listApprovals,
  listArchived,
  listNotifications,
  listProjects,
  listSecurityEvents,
  listSessions,
  markNotificationsRead,
  probeConnector,
  restoreConversation,
  revokeSession,
  setDefaultModel,
  setFeatureFlag,
  setModelEnabled,
  usageSummary,
} from "@/lib/tenro/api";
import { MODEL_CATALOG } from "@/lib/tenro/models";

export function AccountSheets({
  panel,
  onClose,
  conversationId,
  defaultModelId,
  onDefaultModel,
  onCleared,
  onRestored,
}: {
  panel: string | null;
  onClose: () => void;
  conversationId: string | null;
  defaultModelId: string;
  onDefaultModel: (modelId: string) => void;
  onCleared: () => void;
  onRestored: () => void;
}) {
  return (
    <>
      <ProjectsSheet open={panel === "projects"} onClose={onClose} conversationId={conversationId} />
      <UsageSheet open={panel === "usage"} onClose={onClose} defaultModelId={defaultModelId} onDefaultModel={onDefaultModel} />
      <SecuritySheet open={panel === "security"} onClose={onClose} onCleared={onCleared} />
      <NotificationsSheet open={panel === "notifications"} onClose={onClose} />
      <ConnectorsSheet open={panel === "connectors"} onClose={onClose} />
      <ArchivedSheet open={panel === "archived"} onClose={onClose} onRestored={onRestored} />
    </>
  );
}

export function ApprovalList() {
  const [rows, setRows] = useState<{ id: string; tool_id: string; payload: string; status: string }[]>([]);
  const [note, setNote] = useState("");

  function load() {
    listApprovals()
      .then(setRows)
      .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't load approvals."));
  }

  useEffect(() => {
    load();
  }, []);

  const pending = rows.filter((row) => row.status === "pending");
  if (!note && pending.length === 0) return <p className="text-sm text-muted">No approval is waiting.</p>;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-sm font-semibold">Waiting for you</p>
      {note ? <p className="text-sm">{note}</p> : null}
      {pending.map((row) => {
        const name = projectName(row.payload);
        return (
          <div key={row.id} className="stack-row">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Create project</span>
              <span className="block text-xs text-mist">{name || "Unnamed"} is not created yet.</span>
            </span>
            <button type="button" className="text-link tap" onClick={() => settle(row.id, "denied", setNote, load)}>
              Deny
            </button>
            <button type="button" className="text-link tap" onClick={() => settle(row.id, "approved", setNote, load)}>
              Approve
            </button>
          </div>
        );
      })}
    </div>
  );
}

function projectName(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

function settle(id: string, decision: "approved" | "denied", setNote: (value: string) => void, load: () => void) {
  setNote("");
  decideApproval({ data: { id, decision } })
    .then((result) => {
      setNote(result.created ? `Created ${result.created.name}.` : "Request denied. Nothing was created.");
      load();
    })
    .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't update that request."));
}

function ProjectsSheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    listProjects()
      .then(setProjects)
      .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't load projects."));
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Projects" description="Chats can sit in a project you create.">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          createProject({ data: { name } })
            .then((created) => {
              setProjects((current) => [created, ...current]);
              setName("");
              setNote("");
            })
            .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't create that."));
        }}
      >
        <label className="sr-only" htmlFor="project-name">
          Project name
        </label>
        <input id="project-name" className="field" value={name} maxLength={60} placeholder="College, work, a build…" onChange={(event) => setName(event.target.value)} />
        <Button type="submit" disabled={name.trim().length < 2}>
          Create project
        </Button>
        {note ? <p className="text-sm">{note}</p> : null}
        {projects.length === 0 ? <p className="text-sm text-muted">No projects yet.</p> : null}
        {projects.map((project) => (
          <div key={project.id} className="stack-row">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{project.name}</span>
            {conversationId ? (
              <button
                type="button"
                className="text-link tap"
                onClick={() => {
                  assignProject({ data: { conversationId, projectId: project.id } })
                    .then(() => setNote(`This chat is in ${project.name}.`))
                    .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't move that chat."));
                }}
              >
                Add chat
              </button>
            ) : null}
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                if (!window.confirm(`Delete ${project.name}? Chats stay, without this project.`)) return;
                deleteProject({ data: { id: project.id } })
                  .then(() => setProjects((current) => current.filter((item) => item.id !== project.id)))
                  .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't delete that."));
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </form>
    </Sheet>
  );
}

function UsageSheet({
  open,
  onClose,
  defaultModelId,
  onDefaultModel,
}: {
  open: boolean;
  onClose: () => void;
  defaultModelId: string;
  onDefaultModel: (modelId: string) => void;
}) {
  const [hour, setHour] = useState<number | null>(null);
  const [limit, setLimit] = useState(40);
  const [models, setModels] = useState<{ model_id: string; count: number | string }[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    usageSummary()
      .then((summary) => {
        setHour(Number(summary.hour));
        setLimit(summary.hourLimit);
        setModels(summary.models);
      })
      .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't load usage."));
  }, [open]);

  const choices = MODEL_CATALOG.filter((model) => model.status === "available");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Usage" description="Counts come from requests Tenro actually sent.">
      <div className="flex flex-col gap-3">
        <p className="text-sm">{hour === null ? "Loading…" : `${hour} of ${limit} replies in the last hour.`}</p>
        {models.length === 0 ? <p className="text-sm text-muted">No model usage yet.</p> : null}
        {models.map((row) => (
          <div key={row.model_id} className="stack-row">
            <span className="min-w-0 flex-1 truncate text-sm">{labelFor(row.model_id)}</span>
            <span className="text-sm font-semibold">{Number(row.count)}</span>
          </div>
        ))}
        <label className="text-sm font-semibold" htmlFor="default-model">
          Default model for new chats
        </label>
        <select
          id="default-model"
          className="field"
          value={defaultModelId}
          onChange={(event) => {
            const modelId = event.target.value;
            setDefaultModel({ data: { modelId } })
              .then(() => {
                onDefaultModel(modelId);
                setNote("Default model saved.");
              })
              .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't save that model."));
          }}
        >
          {choices.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        {note ? <p className="text-sm">{note}</p> : null}
      </div>
    </Sheet>
  );
}

function labelFor(id: string) {
  return MODEL_CATALOG.find((model) => model.id === id)?.name ?? id;
}

function SecuritySheet({ open, onClose, onCleared }: { open: boolean; onClose: () => void; onCleared: () => void }) {
  const [sessions, setSessions] = useState<{ id: string; created_at: string; user_agent: string | null }[]>([]);
  const [events, setEvents] = useState<{ id: string; kind: string; detail: string }[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [secret, setSecret] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    listSessions()
      .then(setSessions)
      .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't load sessions."));
    listSecurityEvents()
      .then(setEvents)
      .catch(() => undefined);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Security" description="Sessions, a password change, and a generator that saves nothing.">
      <div className="flex flex-col gap-4">
        {sessions.map((session) => (
          <div key={session.id} className="stack-row">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{session.user_agent?.slice(0, 72) || "Session"}</span>
              <span className="block text-xs text-mist">{new Date(session.created_at).toLocaleString()}</span>
            </span>
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                if (!window.confirm("Sign that session out?")) return;
                revokeSession({ data: { id: session.id } })
                  .then(() => setSessions((current) => current.filter((item) => item.id !== session.id)))
                  .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't revoke that session."));
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setNote("");
            void authClient
              .changePassword({ currentPassword, newPassword: nextPassword, revokeOtherSessions: true })
              .then((result) => {
                if (result.error) {
                  setNote(result.error.message || "Couldn't change the password.");
                  return;
                }
                setCurrentPassword("");
                setNextPassword("");
                setNote("Password updated. Other sessions were signed out.");
              })
              .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't change the password."));
          }}
        >
          <p className="text-sm font-semibold">Password</p>
          <input className="field" type="password" autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <input className="field" type="password" autoComplete="new-password" placeholder="New password" minLength={8} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
          <Button type="submit" disabled={currentPassword.length < 8 || nextPassword.length < 8}>
            Update password
          </Button>
        </form>
        <SecretGenerator secret={secret} onSecret={setSecret} />
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm !== "DELETE") {
              setNote("Type DELETE to confirm.");
              return;
            }
            clearAccountData({ data: { confirm } })
              .then(() => onCleared())
              .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't delete that data."));
          }}
        >
          <p className="text-sm font-semibold">Delete Tenro data</p>
          <p className="text-sm text-muted">This removes chats, files, projects, and saved keys. Your sign-in stays.</p>
          <input className="field" value={confirm} placeholder="Type DELETE" onChange={(event) => setConfirm(event.target.value)} />
          <Button type="submit" variant="quiet" disabled={confirm !== "DELETE"}>
            Delete my Tenro data
          </Button>
        </form>
        {events.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Recent events</p>
            {events.map((event) => (
              <p key={event.id} className="text-sm text-muted">
                {event.kind.replaceAll("_", " ")} — {event.detail}
              </p>
            ))}
          </div>
        ) : null}
        {note ? <p className="text-sm">{note}</p> : null}
      </div>
    </Sheet>
  );
}

function SecretGenerator({ secret, onSecret }: { secret: string; onSecret: (value: string) => void }) {
  const [length, setLength] = useState(20);
  const [symbols, setSymbols] = useState(true);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Secret generator</p>
      <p className="text-sm text-muted">Generated here and not saved. Copy it, then clear it.</p>
      <label className="text-sm" htmlFor="secret-length">
        Length {length}
      </label>
      <input id="secret-length" type="range" min={12} max={64} value={length} onChange={(event) => setLength(Number(event.target.value))} />
      <label className="text-sm">
        <input type="checkbox" checked={symbols} onChange={(event) => setSymbols(event.target.checked)} /> Include symbols
      </label>
      <Button
        variant="quiet"
        onClick={() => onSecret(generateSecret(length, symbols))}
      >
        Generate
      </Button>
      {secret ? (
        <>
          <p className="break-all text-sm font-semibold">{secret}</p>
          <p className="text-xs text-mist">{strength(secret)}</p>
          <div className="flex gap-3">
            <button type="button" className="text-link tap" onClick={() => void navigator.clipboard.writeText(secret)}>
              Copy
            </button>
            <button type="button" className="text-link tap" onClick={() => onSecret("")}>
              Clear
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function generateSecret(length: number, symbols: boolean) {
  const alphabet = `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789${symbols ? "!@#$%*-_?" : ""}`;
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function strength(secret: string) {
  if (secret.length >= 20) return "Strong length. This was not stored.";
  if (secret.length >= 14) return "Decent length. This was not stored.";
  return "Short. This was not stored.";
}

function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; body: string; read_at: string | null }[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    listNotifications()
      .then(setRows)
      .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't load notifications."));
  }, [open]);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Notifications" description="Approvals and account changes. Nothing here is invented.">
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? <p className="text-sm text-muted">No notifications yet.</p> : null}
        {rows.map((row) => (
          <p key={row.id} className="text-sm">
            {row.body}
            {row.read_at ? "" : " · new"}
          </p>
        ))}
        {rows.some((row) => !row.read_at) ? (
          <Button
            variant="quiet"
            onClick={() => {
              markNotificationsRead()
                .then(() => setRows((current) => current.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() }))))
                .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't mark those read."));
            }}
          >
            Mark read
          </Button>
        ) : null}
        {note ? <p className="text-sm">{note}</p> : null}
      </div>
    </Sheet>
  );
}

const CONNECTORS = [
  { id: "drive" as const, name: "Google Drive", line: "Search is checked with a live connector call." },
  { id: "calendar" as const, name: "Google Calendar", line: "Calendar list is checked with a live connector call." },
];

const UNAVAILABLE = ["Gmail", "Outlook", "Teams", "Slack", "Notion", "GitHub", "Dropbox"];

function ConnectorsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Connectors" description="Tenro only reports a connection after the connector gate answers.">
      <div className="flex flex-col gap-2">
        {CONNECTORS.map((connector) => (
          <div key={connector.id} className="stack-row">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{connector.name}</span>
              <span className="block text-xs text-mist">{notes[connector.id] || connector.line}</span>
            </span>
            <button
              type="button"
              className="text-link tap"
              disabled={busy === connector.id}
              onClick={() => {
                setBusy(connector.id);
                probeConnector({ data: { id: connector.id } })
                  .then((result) => {
                    if (result.loginUrl) window.open(result.loginUrl, "_blank", "noopener");
                    setNotes((current) => ({ ...current, [connector.id]: result.detail }));
                  })
                  .catch((caught) => setNotes((current) => ({ ...current, [connector.id]: caught instanceof Error ? caught.message : "Couldn't check that." })))
                  .finally(() => setBusy(""));
              }}
            >
              {busy === connector.id ? "Checking…" : "Check"}
            </button>
          </div>
        ))}
        {UNAVAILABLE.map((name) => (
          <div key={name} className="stack-row">
            <span>
              <span className="block text-sm font-semibold">{name}</span>
              <span className="block text-xs text-mist">No connector is available for this, so Tenro won't pretend it is linked.</span>
            </span>
          </div>
        ))}
        <p className="text-sm text-muted">A desktop agent is not connected. Tenro cannot see your computer.</p>
      </div>
    </Sheet>
  );
}

function ArchivedSheet({ open, onClose, onRestored }: { open: boolean; onClose: () => void; onRestored: () => void }) {
  const [rows, setRows] = useState<{ id: string; title: string }[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    listArchived()
      .then(setRows)
      .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't load archived chats."));
  }, [open]);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Archived" description="Archived chats stay in your account until you restore or delete them from history.">
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? <p className="text-sm text-muted">Nothing archived.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="stack-row">
            <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                restoreConversation({ data: { id: row.id } })
                  .then(() => {
                    setRows((current) => current.filter((item) => item.id !== row.id));
                    onRestored();
                  })
                  .catch((caught) => setNote(caught instanceof Error ? caught.message : "Couldn't restore that."));
              }}
            >
              Restore
            </button>
          </div>
        ))}
        {note ? <p className="text-sm">{note}</p> : null}
      </div>
    </Sheet>
  );
}

export function AdminScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{ users: number; chats: number; messages: number; calls: number } | null>(null);
  const [models, setModels] = useState<{ id: string; name: string; enabled: boolean; status: string }[]>([]);
  const [flags, setFlags] = useState<{ key: string; enabled: boolean }[]>([]);
  const [database, setDatabase] = useState<boolean | null>(null);

  useEffect(() => {
    adminOverview()
      .then((overview) => {
        setStats({
          users: Number(overview.users),
          chats: Number(overview.chats),
          messages: Number(overview.messages),
          calls: Number(overview.calls),
        });
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Admin access is required."));
    adminListModels()
      .then(setModels)
      .catch(() => undefined);
    adminListFlags()
      .then(setFlags)
      .catch(() => undefined);
    health()
      .then((result) => setDatabase(result.database))
      .catch(() => setDatabase(false));
  }, []);

  return (
    <main className="grove min-h-dvh">
      <div className="shell px-4 py-6">
        <button type="button" className="text-link tap" onClick={() => navigate({ to: "/" })}>
          Back to Tenro
        </button>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">Counts are read from the database. A normal account cannot open this.</p>
        {error ? <p className="mt-4 text-sm">{error}</p> : null}
        {stats ? (
          <div className="prompt-grid mt-5">
            <Stat label="Profiles" value={stats.users} />
            <Stat label="Chats" value={stats.chats} />
            <Stat label="Messages" value={stats.messages} />
            <Stat label="AI requests" value={stats.calls} />
          </div>
        ) : null}
        <p className="mt-4 text-sm text-muted">Database health: {database === null ? "Checking…" : database ? "Reachable" : "Not reachable"}</p>
        <div className="mt-6 flex flex-col gap-2">
          {flags.map((flag) => (
            <button
              key={flag.key}
              type="button"
              className="stack-row"
              onClick={() => {
                if (flag.key !== "agent_mode" && flag.key !== "file_upload") return;
                const key = flag.key;
                setFeatureFlag({ data: { key, enabled: !flag.enabled } })
                  .then(() => setFlags((current) => current.map((item) => (item.key === flag.key ? { ...item, enabled: !item.enabled } : item))))
                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn't update that flag."));
              }}
            >
              <span className="min-w-0 flex-1 text-sm font-semibold">{flag.key.replaceAll("_", " ")}</span>
              <span className="text-sm">{flag.enabled ? "On" : "Off"}</span>
            </button>
          ))}
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              className="stack-row"
              onClick={() => {
                setModelEnabled({ data: { id: model.id, enabled: !model.enabled } })
                  .then(() => setModels((current) => current.map((item) => (item.id === model.id ? { ...item, enabled: !item.enabled } : item))))
                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Couldn't update that model."));
              }}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{model.name}</span>
              <span className="text-xs text-mist">{model.enabled ? "Enabled" : "Disabled"} · {model.status}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="prompt-card">
      <span className="block text-2xl font-semibold">{value}</span>
      <span className="mt-1 block text-xs text-mist">{label}</span>
    </div>
  );
}
