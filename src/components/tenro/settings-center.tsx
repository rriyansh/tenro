import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Bell,
  Bot,
  ChevronLeft,
  FileText,
  KeyRound,
  Lock,
  MessageSquare,
  MonitorSmartphone,
  Palette,
  Plug,
  Scale,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import curiousUrl from "@/assets/tenro-curious.png";
import smileUrl from "@/assets/tenro-smile.png";
import thinkUrl from "@/assets/tenro-think.png";
import { TenroMark } from "@/components/tenro/mark";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { LOOKS, STYLES, cleanName, isPersonName, isPreferredName, type LookId, type Profile, type StyleId } from "@/lib/profile";
import {
  acceptLegal,
  clearAccountData,
  clearConversations,
  deleteCredential,
  deleteFile,
  exportAccount,
  listCredentials,
  listDeviceSessions,
  listFiles,
  listLegalAcceptances,
  listNotifications,
  listSecurityEvents,
  markNotificationsRead,
  probeConnector,
  readDocument,
  recordPasswordChanged,
  renameFile,
  revokeOtherSessions,
  revokeSession,
  saveCredential,
  saveDocument,
  saveSettings,
  setDefaultModel,
  testStoredCredential,
  updateDocument,
  usageSummary,
} from "@/lib/tenro/api";
import { MODEL_CATALOG, PROVIDERS } from "@/lib/tenro/models";
import {
  HELP_ARTICLES,
  LEGAL_DOCS,
  LANGUAGES,
  TIMEZONES,
  type AvatarId,
  type UserSettings,
} from "@/lib/tenro/settings";

type CategoryId =
  | "profile"
  | "appearance"
  | "personal"
  | "ai"
  | "chat"
  | "notify"
  | "sessions"
  | "security"
  | "privacy"
  | "apps"
  | "api"
  | "files"
  | "access"
  | "legal"
  | "help"
  | "delete";

const NAV: { id: CategoryId; label: string; hint: string; keywords: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profile & Account", hint: "Name, username, language", keywords: "name username email avatar photo timezone language account", icon: User },
  { id: "appearance", label: "Appearance", hint: "Theme, type, density", keywords: "theme light dark colour color font size density motion accent sidebar", icon: Palette },
  { id: "personal", label: "Personalization", hint: "How Tenro talks to you", keywords: "preferred name style length memory language", icon: Sparkles },
  { id: "ai", label: "AI Preferences", hint: "Model, streaming, tools", keywords: "model provider streaming agent tools confirmation reasoning", icon: Bot },
  { id: "chat", label: "Chat & Conversation", hint: "History, markdown, titles", keywords: "chat history markdown code archive delete export search", icon: MessageSquare },
  { id: "notify", label: "Notifications", hint: "What you hear about", keywords: "notification alert agent security account provider", icon: Bell },
  { id: "sessions", label: "Sessions & Devices", hint: "Where you are signed in", keywords: "session device sign out revoke browser", icon: MonitorSmartphone },
  { id: "security", label: "Security", hint: "Password and protection", keywords: "password security 2fa two-factor credential event history", icon: Shield },
  { id: "privacy", label: "Privacy & Data", hint: "Export and what is kept", keywords: "privacy export data memory delete download", icon: Lock },
  { id: "apps", label: "Connected Apps", hint: "Drive, Calendar, and the rest", keywords: "connector drive calendar gmail slack github permission disconnect", icon: Plug },
  { id: "api", label: "API & Developer", hint: "Your provider keys", keywords: "api key provider secret webhook usage developer", icon: KeyRound },
  { id: "files", label: "Files & Documents", hint: "Create, preview, download", keywords: "file document pdf markdown csv json code upload", icon: FileText },
  { id: "access", label: "Accessibility", hint: "Motion, size, contrast", keywords: "accessibility motion contrast keyboard screen reader text size", icon: Accessibility },
  { id: "legal", label: "Terms & Legal", hint: "Rules and acceptance", keywords: "terms privacy cookie policy legal acceptable use", icon: Scale },
  { id: "help", label: "Help & Documentation", hint: "Guides and answers", keywords: "help docs documentation faq troubleshooting shortcut", icon: Settings },
  { id: "delete", label: "Delete Account", hint: "Remove Tenro data", keywords: "delete account destroy remove data", icon: Trash2 },
];

const AVATARS: { id: AvatarId; label: string }[] = [
  { id: "mark", label: "Mark" },
  { id: "smile", label: "Smile" },
  { id: "curious", label: "Curious" },
  { id: "think", label: "Think" },
  { id: "initials", label: "Letter" },
];

type StoredFile = { id: string; name: string; mime: string; size_bytes: number; created_at: string };
type SessionRow = { id: string; created_at: string; ip_address: string | null; user_agent: string | null };
type EventRow = { id: string; kind: string; detail: string; created_at: string };

export function SettingsCenter({
  profile,
  email,
  role,
  defaultModelId,
  prefs,
  onClose,
  onProfileChange,
  onPrefs,
  onDefaultModel,
  onCleared,
  onChatsCleared,
  onOpenArchived,
  onOpenMenu,
  onCredential,
}: {
  profile: Profile;
  email: string | null;
  role: string;
  defaultModelId: string;
  prefs: UserSettings;
  onClose: () => void;
  onProfileChange: (profile: Profile) => void;
  onPrefs: (next: UserSettings) => void;
  onDefaultModel: (modelId: string) => void;
  onCleared: () => void;
  onChatsCleared: () => void;
  onOpenArchived: () => void;
  onOpenMenu: () => void;
  onCredential: (providerId: string, hint: string | null) => void;
}) {
  const [section, setSection] = useState<CategoryId | null>(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 800px)").matches ? "profile" : null,
  );
  const [query, setQuery] = useState("");
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [preferredDraft, setPreferredDraft] = useState(profile.preferredName);
  const [usernameDraft, setUsernameDraft] = useState(prefs.username ?? "");
  const [language, setLanguage] = useState(prefs.language);
  const [timezone, setTimezone] = useState(prefs.timezone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [note, setNote] = useState("");
  const [helpId, setHelpId] = useState<string | null>(null);
  const [legalKey, setLegalKey] = useState<string | null>(null);

  const dirty =
    cleanName(nameDraft) !== profile.name ||
    cleanName(preferredDraft) !== profile.preferredName ||
    (usernameDraft.trim().toLowerCase() || null) !== (prefs.username ?? null) ||
    language !== prefs.language ||
    timezone !== prefs.timezone;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.filter((item) => `${item.label} ${item.hint} ${item.keywords}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 800px)");
    const apply = () => {
      if (media.matches) setSection((current) => current ?? "profile");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function close() {
    if (dirty && !window.confirm("You have unsaved profile changes. Leave without saving?")) return;
    onClose();
  }

  function openSection(next: CategoryId) {
    if (dirty && next !== section && !window.confirm("You have unsaved profile changes. Leave without saving?")) return;
    if (dirty && next !== section) cancelIdentity();
    setHelpId(null);
    setLegalKey(null);
    setSection(next);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function persist(patch: Partial<UserSettings>, next: UserSettings, saved: string) {
    setStatus("saving");
    setNote("");
    try {
      await saveSettings({ data: patch });
      onPrefs(next);
      setStatus("saved");
      setNote(saved);
    } catch (caught) {
      setStatus("error");
      setNote(caught instanceof Error ? caught.message : "Couldn't save that.");
    }
  }

  function toggle<K extends keyof UserSettings>(key: K, value: UserSettings[K], saved = "Saved.") {
    void persist({ [key]: value } as Partial<UserSettings>, { ...prefs, [key]: value }, saved);
  }

  async function saveIdentity() {
    const name = cleanName(nameDraft);
    const preferredName = cleanName(preferredDraft);
    if (!isPersonName(name) || !isPreferredName(preferredName)) {
      setStatus("error");
      setNote("Use your real name, and a shorter name Tenro can say.");
      return;
    }
    const username = usernameDraft.trim().toLowerCase();
    if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
      setStatus("error");
      setNote("Usernames are 3–20 letters, numbers, or underscores.");
      return;
    }
    setStatus("saving");
    setNote("");
    try {
      await saveSettings({ data: { username: username || null, language, timezone } });
      onProfileChange({ ...profile, name, preferredName });
      onPrefs({ ...prefs, username: username || null, language, timezone });
      setStatus("saved");
      setNote("Profile saved.");
    } catch (caught) {
      setStatus("error");
      setNote(caught instanceof Error ? caught.message : "Couldn't save your profile.");
    }
  }

  function cancelIdentity() {
    setNameDraft(profile.name);
    setPreferredDraft(profile.preferredName);
    setUsernameDraft(prefs.username ?? "");
    setLanguage(prefs.language);
    setTimezone(prefs.timezone);
    setStatus("idle");
    setNote("Changes discarded.");
  }

  const active = NAV.find((item) => item.id === section) ?? null;
  const help = HELP_ARTICLES.find((item) => item.id === helpId) ?? null;
  const legal = LEGAL_DOCS.find((item) => item.key === legalKey) ?? null;

  return (
    <div className="settings-shell" role="dialog" aria-modal="true" aria-label="Settings" data-open={section ? "section" : "nav"}>
      <aside className="settings-nav">
        <div className="flex items-center gap-2 px-3 pt-4">
          <p className="text-lg font-semibold">Settings</p>
          <button type="button" className="icon-btn tap ml-auto" aria-label="Close settings" onClick={close}>
            <X className="size-5" />
          </button>
        </div>
        <label className="sr-only" htmlFor="settings-search">
          Search settings
        </label>
        <div className="px-3 pt-3">
          <div className="settings-search">
            <Search className="size-4 text-mist" />
            <input id="settings-search" value={query} placeholder="Search settings" onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <nav className="settings-nav-list" aria-label="Settings categories">
          {shown.length === 0 ? <p className="px-4 text-sm text-mist">No settings match that.</p> : null}
          {shown.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={item.id === section ? "settings-link on" : "settings-link"} aria-current={item.id === section ? "page" : undefined} onClick={() => openSection(item.id)}>
                <Icon className="size-5" />
                <span>
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-mist">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="settings-main" aria-labelledby="settings-heading">
        <button type="button" className="settings-back text-link tap" onClick={() => setSection(null)}>
          <ChevronLeft className="size-4" />
          All settings
        </button>
        <p id="settings-heading" className="text-2xl font-semibold tracking-tight">
          {legal ? legal.title : help ? help.title : active?.label ?? "Settings"}
        </p>
        <p className="mt-1 text-sm text-muted">{legal ? `Version ${legal.version}` : help ? help.category : active?.hint}</p>
        <p className="settings-status" role="status" data-state={status}>
          {status === "saving" ? "Saving…" : note}
        </p>
        {section === "profile" ? (
          <ProfileSection profile={profile} email={email} role={role} prefs={prefs} nameDraft={nameDraft} usernameDraft={usernameDraft} language={language} timezone={timezone} onName={setNameDraft} onUsername={setUsernameDraft} onLanguage={setLanguage} onTimezone={setTimezone} onAvatar={(avatarId) => toggle("avatarId", avatarId, "Avatar saved.")} />
        ) : null}
        {section === "appearance" ? (
          <AppearanceSection profile={profile} prefs={prefs} onLook={(appearance) => onProfileChange({ ...profile, appearance })} onPatch={(patch, saved) => void persist(patch, { ...prefs, ...patch }, saved)} />
        ) : null}
        {section === "personal" ? (
          <PersonalSection profile={profile} prefs={prefs} preferredDraft={preferredDraft} language={language} onPreferred={setPreferredDraft} onLanguage={setLanguage} onStyle={(style) => onProfileChange({ ...profile, style })} onLength={(responseLength) => toggle("responseLength", responseLength, "Response length saved.")} onMemory={(memoryEnabled) => {
              if (memoryEnabled && !window.confirm("This only keeps the preferences on this page, such as your name and style. Tenro does not build a separate memory. Turn it on?")) return;
              toggle("memoryEnabled", memoryEnabled, memoryEnabled ? "Personalization is on." : "Personalization memory is off.");
            }} />
        ) : null}
        {section === "ai" ? (
          <AiSection prefs={prefs} defaultModelId={defaultModelId} onDefaultModel={async (modelId) => {
              setStatus("saving");
              try {
                await setDefaultModel({ data: { modelId } });
                onDefaultModel(modelId);
                setStatus("saved");
                setNote("Default model saved.");
              } catch (caught) {
                setStatus("error");
                setNote(caught instanceof Error ? caught.message : "Couldn't save that model.");
              }
            }} onToggle={(key, value) => toggle(key, value)} />
        ) : null}
        {section === "chat" ? (
          <ChatSection prefs={prefs} onToggle={(key, value) => toggle(key, value)} onArchive={onOpenArchived} onMenu={onOpenMenu} onPrivacy={() => openSection("privacy")} onClear={async (confirm) => {
              setStatus("saving");
              try {
                await clearConversations({ data: { confirm } });
                onChatsCleared();
                setStatus("saved");
                setNote("Chat history deleted.");
              } catch (caught) {
                setStatus("error");
                setNote(caught instanceof Error ? caught.message : "Couldn't clear chats.");
              }
            }} />
        ) : null}
        {section === "notify" ? <NotifySection prefs={prefs} onToggle={(key, value) => toggle(key, value)} /> : null}
        {section === "sessions" ? <SessionsSection onNote={setFail(setStatus, setNote)} /> : null}
        {section === "security" ? (
          <SecuritySection onSessions={() => openSection("sessions")} onApps={() => openSection("apps")} onApi={() => openSection("api")} onNote={setFail(setStatus, setNote)} onSaved={(message) => {
              setStatus("saved");
              setNote(message);
            }} />
        ) : null}
        {section === "privacy" ? (
          <PrivacySection prefs={prefs} onMemory={() => openSection("personal")} onFiles={() => openSection("files")} onDelete={() => openSection("delete")} onClear={() => openSection("chat")} onResult={(ok, message) => {
              setStatus(ok ? "saved" : "error");
              setNote(message);
            }} />
        ) : null}
        {section === "apps" ? <AppsSection /> : null}
        {section === "api" ? <ApiSection onCredential={onCredential} onNote={setFail(setStatus, setNote)} /> : null}
        {section === "files" ? <FilesSection onNote={setFail(setStatus, setNote)} /> : null}
        {section === "access" ? (
          <AccessSection prefs={prefs} onPatch={(patch) => void persist(patch, { ...prefs, ...patch }, "Accessibility saved.")} />
        ) : null}
        {section === "legal" ? (
          <LegalSection selected={legal} onOpen={setLegalKey} onBack={() => setLegalKey(null)} onAccepted={(message) => {
              setStatus("saved");
              setNote(message);
            }} />
        ) : null}
        {section === "help" ? <HelpSection query={query} selected={help} onOpen={setHelpId} onBack={() => setHelpId(null)} /> : null}
        {section === "delete" ? (
          <DeleteSection email={email} onCleared={onCleared} onFail={(message) => {
              setStatus("error");
              setNote(message);
            }} />
        ) : null}
        {dirty && (section === "profile" || section === "personal") ? (
          <div className="save-bar">
            <p className="text-sm font-semibold">Unsaved profile changes</p>
            <div className="flex gap-2">
              <Button variant="quiet" onClick={cancelIdentity}>Cancel</Button>
              <Button onClick={() => void saveIdentity()} disabled={status === "saving"}>Save</Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function setFail(setStatus: (value: "idle" | "saving" | "saved" | "error") => void, setNote: (value: string) => void) {
  return (message: string) => {
    setStatus("error");
    setNote(message);
  };
}

function ProfileSection({
  profile, email, role, prefs, nameDraft, usernameDraft, language, timezone, onName, onUsername, onLanguage, onTimezone, onAvatar,
}: {
  profile: Profile; email: string | null; role: string; prefs: UserSettings; nameDraft: string; usernameDraft: string; language: string; timezone: string; onName: (value: string) => void; onUsername: (value: string) => void; onLanguage: (value: string) => void; onTimezone: (value: string) => void; onAvatar: (id: AvatarId) => void;
}) {
  const zones = timezone && !TIMEZONES.includes(timezone as (typeof TIMEZONES)[number]) ? [timezone, ...TIMEZONES] : [...TIMEZONES];
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Tenro’s character</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist">This is the agent in chats. It is separate from your account name.</p>
        <div className="avatar-row">
          {AVATARS.map((avatar) => (
            <button key={avatar.id} type="button" className={prefs.avatarId === avatar.id ? "avatar-pick on" : "avatar-pick"} aria-pressed={prefs.avatarId === avatar.id} onClick={() => onAvatar(avatar.id)}>
              <AgentFace id={avatar.id} name={profile.preferredName} />
              <span>{avatar.label}</span>
            </button>
          ))}
        </div>
      </article>
      <article className="settings-card settings-form">
        <label className="text-sm font-semibold">Display name<input className="field mt-2" value={nameDraft} maxLength={40} autoComplete="name" onChange={(event) => onName(event.target.value)} /></label>
        <label className="text-sm font-semibold">Username<input className="field mt-2" value={usernameDraft} maxLength={20} autoCapitalize="none" spellCheck={false} placeholder="optional" onChange={(event) => onUsername(event.target.value)} /></label>
        <label className="text-sm font-semibold">Language for replies<select className="field mt-2" value={language} onChange={(event) => onLanguage(event.target.value)}>{LANGUAGES.map((item) => (<option key={item.id} value={item.id}>{item.label}</option>))}</select></label>
        <p className="text-xs text-mist">The menus stay in English. Tenro can prefer this language in replies.</p>
        <label className="text-sm font-semibold">Timezone<select className="field mt-2" value={timezone} onChange={(event) => onTimezone(event.target.value)}>{zones.map((zone) => (<option key={zone} value={zone}>{zone}</option>))}</select></label>
        <p className="text-sm text-muted">Email: {email ?? "Not available on this session"}</p>
        <p className="text-xs text-mist">Email can’t be changed here. Google and X addresses stay with those accounts.</p>
        <p className="text-sm text-muted">Account type: {role === "admin" ? "Administrator" : "Member"}</p>
      </article>
      <p className="text-xs leading-relaxed text-mist">On a phone, add Tenro to your home screen from the browser menu. A separate install file is not offered.</p>
    </div>
  );
}
