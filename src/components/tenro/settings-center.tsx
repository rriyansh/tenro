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
            <input
              id="settings-search"
              value={query}
              placeholder="Search settings"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <nav className="settings-nav-list" aria-label="Settings categories">
          {shown.length === 0 ? <p className="px-4 text-sm text-mist">No settings match that.</p> : null}
          {shown.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={item.id === section ? "settings-link on" : "settings-link"}
                aria-current={item.id === section ? "page" : undefined}
                onClick={() => openSection(item.id)}
              >
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
          <ProfileSection
            profile={profile}
            email={email}
            role={role}
            prefs={prefs}
            nameDraft={nameDraft}
            usernameDraft={usernameDraft}
            language={language}
            timezone={timezone}
            onName={setNameDraft}
            onUsername={setUsernameDraft}
            onLanguage={setLanguage}
            onTimezone={setTimezone}
            onAvatar={(avatarId) => toggle("avatarId", avatarId, "Avatar saved.")}
          />
        ) : null}
        {section === "appearance" ? (
          <AppearanceSection
            profile={profile}
            prefs={prefs}
            onLook={(appearance) => onProfileChange({ ...profile, appearance })}
            onPatch={(patch, saved) => void persist(patch, { ...prefs, ...patch }, saved)}
          />
        ) : null}
        {section === "personal" ? (
          <PersonalSection
            profile={profile}
            prefs={prefs}
            preferredDraft={preferredDraft}
            language={language}
            onPreferred={setPreferredDraft}
            onLanguage={setLanguage}
            onStyle={(style) => onProfileChange({ ...profile, style })}
            onLength={(responseLength) => toggle("responseLength", responseLength, "Response length saved.")}
            onMemory={(memoryEnabled) => {
              if (memoryEnabled && !window.confirm("This only keeps the preferences on this page, such as your name and style. Tenro does not build a separate memory. Turn it on?")) return;
              toggle("memoryEnabled", memoryEnabled, memoryEnabled ? "Personalization is on." : "Personalization memory is off.");
            }}
          />
        ) : null}
        {section === "ai" ? (
          <AiSection
            prefs={prefs}
            defaultModelId={defaultModelId}
            onDefaultModel={async (modelId) => {
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
            }}
            onToggle={(key, value) => toggle(key, value)}
          />
        ) : null}
        {section === "chat" ? (
          <ChatSection
            prefs={prefs}
            onToggle={(key, value) => toggle(key, value)}
            onArchive={onOpenArchived}
            onMenu={onOpenMenu}
            onPrivacy={() => openSection("privacy")}
            onClear={async (confirm) => {
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
            }}
          />
        ) : null}
        {section === "notify" ? <NotifySection prefs={prefs} onToggle={(key, value) => toggle(key, value)} /> : null}
        {section === "sessions" ? <SessionsSection onNote={setFail(setStatus, setNote)} /> : null}
        {section === "security" ? (
          <SecuritySection
            onSessions={() => openSection("sessions")}
            onApps={() => openSection("apps")}
            onApi={() => openSection("api")}
            onNote={setFail(setStatus, setNote)}
            onSaved={(message) => {
              setStatus("saved");
              setNote(message);
            }}
          />
        ) : null}
        {section === "privacy" ? (
          <PrivacySection
            prefs={prefs}
            onMemory={() => openSection("personal")}
            onFiles={() => openSection("files")}
            onDelete={() => openSection("delete")}
            onClear={() => openSection("chat")}
            onResult={(ok, message) => {
              setStatus(ok ? "saved" : "error");
              setNote(message);
            }}
          />
        ) : null}
        {section === "apps" ? <AppsSection /> : null}
        {section === "api" ? <ApiSection onCredential={onCredential} onNote={setFail(setStatus, setNote)} /> : null}
        {section === "files" ? <FilesSection onNote={setFail(setStatus, setNote)} /> : null}
        {section === "access" ? (
          <AccessSection prefs={prefs} onPatch={(patch) => void persist(patch, { ...prefs, ...patch }, "Accessibility saved.")} />
        ) : null}
        {section === "legal" ? (
          <LegalSection
            selected={legal}
            onOpen={setLegalKey}
            onBack={() => setLegalKey(null)}
            onAccepted={(message) => {
              setStatus("saved");
              setNote(message);
            }}
          />
        ) : null}
        {section === "help" ? (
          <HelpSection query={query} selected={help} onOpen={setHelpId} onBack={() => setHelpId(null)} />
        ) : null}
        {section === "delete" ? (
          <DeleteSection
            email={email}
            onCleared={onCleared}
            onFail={(message) => {
              setStatus("error");
              setNote(message);
            }}
          />
        ) : null}
        {dirty && (section === "profile" || section === "personal") ? (
          <div className="save-bar">
            <p className="text-sm font-semibold">Unsaved profile changes</p>
            <div className="flex gap-2">
              <Button variant="quiet" onClick={cancelIdentity}>
                Cancel
              </Button>
              <Button onClick={() => void saveIdentity()} disabled={status === "saving"}>
                Save
              </Button>
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
  profile,
  email,
  role,
  prefs,
  nameDraft,
  usernameDraft,
  language,
  timezone,
  onName,
  onUsername,
  onLanguage,
  onTimezone,
  onAvatar,
}: {
  profile: Profile;
  email: string | null;
  role: string;
  prefs: UserSettings;
  nameDraft: string;
  usernameDraft: string;
  language: string;
  timezone: string;
  onName: (value: string) => void;
  onUsername: (value: string) => void;
  onLanguage: (value: string) => void;
  onTimezone: (value: string) => void;
  onAvatar: (id: AvatarId) => void;
}) {
  const zones = timezone && !TIMEZONES.includes(timezone as (typeof TIMEZONES)[number]) ? [timezone, ...TIMEZONES] : [...TIMEZONES];
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Tenro’s character</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist">This is the agent in chats. It is separate from your account name.</p>
        <div className="avatar-row">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              className={prefs.avatarId === avatar.id ? "avatar-pick on" : "avatar-pick"}
              aria-pressed={prefs.avatarId === avatar.id}
              onClick={() => onAvatar(avatar.id)}
            >
              <AgentFace id={avatar.id} name={profile.preferredName} />
              <span>{avatar.label}</span>
            </button>
          ))}
        </div>
      </article>
      <article className="settings-card settings-form">
        <label className="text-sm font-semibold">
          Display name
          <input className="field mt-2" value={nameDraft} maxLength={40} autoComplete="name" onChange={(event) => onName(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Username
          <input className="field mt-2" value={usernameDraft} maxLength={20} autoCapitalize="none" spellCheck={false} placeholder="optional" onChange={(event) => onUsername(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Language for replies
          <select className="field mt-2" value={language} onChange={(event) => onLanguage(event.target.value)}>
            {LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-mist">The menus stay in English. Tenro can prefer this language in replies.</p>
        <label className="text-sm font-semibold">
          Timezone
          <select className="field mt-2" value={timezone} onChange={(event) => onTimezone(event.target.value)}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted">Email: {email ?? "Not available on this session"}</p>
        <p className="text-xs text-mist">Email can’t be changed here. Google and X addresses stay with those accounts.</p>
        <p className="text-sm text-muted">Account type: {role === "admin" ? "Administrator" : "Member"}</p>
      </article>
      <p className="text-xs leading-relaxed text-mist">
        On a phone, add Tenro to your home screen from the browser menu. A separate install file is not offered.
      </p>
    </div>
  );
}

function AppearanceSection({
  profile,
  prefs,
  onLook,
  onPatch,
}: {
  profile: Profile;
  prefs: UserSettings;
  onLook: (look: LookId) => void;
  onPatch: (patch: Partial<UserSettings>, saved: string) => void;
}) {
  return (
    <div className="settings-stack">
      <article className="settings-card settings-preview">
        <AgentFace id={prefs.avatarId} name={profile.preferredName} />
        <div>
          <p className="brand-type font-semibold">Ask once.</p>
          <p className="text-sm text-muted">This screen updates as you change theme, size, and colour.</p>
        </div>
      </article>
      <Choice
        legend="Theme"
        value={prefs.theme}
        options={[
          { id: "system", label: "System" },
          { id: "dark", label: "Dark" },
          { id: "light", label: "Light" },
        ]}
        onChange={(theme) => onPatch({ theme }, "Theme saved.")}
      />
      <Choice legend="Accent" value={profile.appearance} options={LOOKS.map((look) => ({ id: look.id, label: look.label }))} onChange={onLook} />
      <p className="text-xs text-mist">Accents stay in Tenro’s green. The menu still opens over the chat. It is not a fixed column.</p>
      <Choice
        legend="Density"
        value={prefs.density}
        options={[
          { id: "comfortable", label: "Comfortable" },
          { id: "compact", label: "Compact" },
        ]}
        onChange={(density) => onPatch({ density }, "Density saved.")}
      />
      <Choice
        legend="Text size"
        value={prefs.fontScale}
        options={[
          { id: "sm", label: "Small" },
          { id: "md", label: "Default" },
          { id: "lg", label: "Large" },
        ]}
        onChange={(fontScale) => onPatch({ fontScale }, "Text size saved.")}
      />
      <Choice
        legend="Motion"
        value={prefs.motion}
        options={[
          { id: "system", label: "System" },
          { id: "full", label: "Full" },
          { id: "reduce", label: "Reduce" },
        ]}
        onChange={(motion) => onPatch({ motion }, "Motion saved.")}
      />
      <Choice
        legend="Contrast"
        value={prefs.contrast}
        options={[
          { id: "default", label: "Default" },
          { id: "high", label: "High" },
        ]}
        onChange={(contrast) => onPatch({ contrast }, "Contrast saved.")}
      />
    </div>
  );
}

function PersonalSection({
  profile,
  prefs,
  preferredDraft,
  language,
  onPreferred,
  onLanguage,
  onStyle,
  onLength,
  onMemory,
}: {
  profile: Profile;
  prefs: UserSettings;
  preferredDraft: string;
  language: string;
  onPreferred: (value: string) => void;
  onLanguage: (value: string) => void;
  onStyle: (style: StyleId) => void;
  onLength: (value: UserSettings["responseLength"]) => void;
  onMemory: (value: boolean) => void;
}) {
  return (
    <div className="settings-stack">
      <article className="settings-card settings-form">
        <label className="text-sm font-semibold">
          What Tenro calls you
          <input className="field mt-2" value={preferredDraft} maxLength={24} onChange={(event) => onPreferred(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Reply language
          <select className="field mt-2" value={language} onChange={(event) => onLanguage(event.target.value)}>
            {LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-mist">Save profile changes with the bar below. Style and length save on their own.</p>
      </article>
      <Choice legend="Response style" value={profile.style} options={STYLES.map((item) => ({ id: item.id, label: item.label }))} onChange={onStyle} />
      <Choice
        legend="Response length"
        value={prefs.responseLength}
        options={[
          { id: "short", label: "Short" },
          { id: "normal", label: "Normal" },
          { id: "long", label: "Long" },
        ]}
        onChange={onLength}
      />
      <article className="settings-card">
        <Toggle
          on={prefs.memoryEnabled}
          label="Use saved preferences in replies"
          detail="Off by default. When on, Tenro may use your name, style, and language. It does not store a hidden biography."
          onChange={onMemory}
        />
      </article>
    </div>
  );
}

function AiSection({
  prefs,
  defaultModelId,
  onDefaultModel,
  onToggle,
}: {
  prefs: UserSettings;
  defaultModelId: string;
  onDefaultModel: (modelId: string) => void;
  onToggle: (key: "streaming" | "confirmTools", value: boolean) => void;
}) {
  const models = MODEL_CATALOG.filter((model) => model.status === "available");
  return (
    <div className="settings-stack">
      <article className="settings-card settings-form">
        <label className="text-sm font-semibold">
          Default model
          <select className="field mt-2" value={defaultModelId} onChange={(event) => onDefaultModel(event.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} · {model.provider}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-relaxed text-mist">
          New chats start here. The composer can still switch models. Capabilities differ: some are faster, some reason longer, and some need your own provider key. Tenro does not auto-pick a different model.
        </p>
      </article>
      <article className="settings-card">
        <Toggle
          on={prefs.streaming}
          label="Stream replies"
          detail="Used for xAI, OpenAI, DeepSeek, and LongCat in chat mode. Agent mode and other providers wait for the full reply."
          onChange={(value) => onToggle("streaming", value)}
        />
        <Toggle
          on={prefs.confirmTools}
          label="Ask before a tool change"
          detail="Creating a project still waits for your approval either way. This adds the same caution to Tenro’s instructions."
          onChange={(value) => onToggle("confirmTools", value)}
        />
      </article>
    </div>
  );
}

function ChatSection({
  prefs,
  onToggle,
  onArchive,
  onMenu,
  onPrivacy,
  onClear,
}: {
  prefs: UserSettings;
  onToggle: (key: "markdown" | "autoTitle" | "confirmDelete", value: boolean) => void;
  onArchive: () => void;
  onMenu: () => void;
  onPrivacy: () => void;
  onClear: (confirm: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <Toggle on={prefs.markdown} label="Render Markdown" detail="Off shows the reply as plain text. Code blocks can still be copied when rendering is on." onChange={(value) => onToggle("markdown", value)} />
        <Toggle on={prefs.autoTitle} label="Name new chats from the first message" detail="Off keeps the title as New chat until you rename it." onChange={(value) => onToggle("autoTitle", value)} />
        <Toggle on={prefs.confirmDelete} label="Confirm before deleting a chat" detail="A delete removes that conversation from your account." onChange={(value) => onToggle("confirmDelete", value)} />
      </article>
      <article className="settings-card flex flex-col gap-2">
        <p className="text-sm font-semibold">History</p>
        <p className="text-xs leading-relaxed text-mist">Search matches chat titles in the menu. Archive keeps a chat without showing it in the recent list.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" onClick={onMenu}>
            Search chats
          </Button>
          <Button variant="quiet" onClick={onArchive}>
            Archived chats
          </Button>
          <Button variant="quiet" onClick={onPrivacy}>
            Export conversations
          </Button>
        </div>
      </article>
      <article className="settings-card settings-form">
        <p className="text-sm font-semibold">Clear chat history</p>
        <p className="text-xs leading-relaxed text-mist">This permanently deletes every conversation and its messages. Files and settings stay.</p>
        <input className="field" value={confirm} placeholder="Type CLEAR" onChange={(event) => setConfirm(event.target.value)} />
        <Button
          variant="quiet"
          disabled={confirm !== "CLEAR"}
          onClick={() => {
            if (!window.confirm("Delete every conversation? This cannot be undone.")) return;
            onClear(confirm);
            setConfirm("");
          }}
        >
          Delete all chats
        </Button>
      </article>
    </div>
  );
}

function NotifySection({ prefs, onToggle }: { prefs: UserSettings; onToggle: (key: "notifyInApp" | "notifyAgent" | "notifySecurity" | "notifyAccount" | "notifyProvider", value: boolean) => void }) {
  const [rows, setRows] = useState<{ id: string; body: string; read_at: string | null }[]>([]);
  const [localNote, setLocalNote] = useState("");
  useEffect(() => {
    listNotifications()
      .then(setRows)
      .catch((caught) => setLocalNote(caught instanceof Error ? caught.message : "Couldn't load notifications."));
  }, []);
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <Toggle on={prefs.notifyInApp} label="In-app list" detail="Turns the list below off. Existing rows stay stored." onChange={(value) => onToggle("notifyInApp", value)} />
        <Toggle on={prefs.notifyAgent} label="Agent tasks" detail="A notice is added when you approve a new project." onChange={(value) => onToggle("notifyAgent", value)} />
        <Toggle on={prefs.notifySecurity} label="Security alerts" detail="Session and password events stay in Security history either way." onChange={(value) => onToggle("notifySecurity", value)} />
        <Toggle on={prefs.notifyAccount} label="Account changes" detail="Profile updates are recorded in Security history." onChange={(value) => onToggle("notifyAccount", value)} />
        <Toggle on={prefs.notifyProvider} label="Provider notices" detail="Key tests and removals are recorded in Security history." onChange={(value) => onToggle("notifyProvider", value)} />
      </article>
      <article className="settings-card">
        <p className="text-sm font-semibold">Recent notices</p>
        {!prefs.notifyInApp ? <p className="mt-2 text-sm text-muted">The in-app list is off.</p> : null}
        {prefs.notifyInApp && rows.length === 0 ? <p className="mt-2 text-sm text-muted">No notifications yet.</p> : null}
        {prefs.notifyInApp
          ? rows.map((row) => (
              <p key={row.id} className="mt-2 text-sm">
                {row.body}
                {row.read_at ? "" : " · new"}
              </p>
            ))
          : null}
        {prefs.notifyInApp && rows.some((row) => !row.read_at) ? (
          <Button
            variant="quiet"
            className="mt-3"
            onClick={() => {
              markNotificationsRead()
                .then(() => setRows((current) => current.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() }))))
                .catch((caught) => setLocalNote(caught instanceof Error ? caught.message : "Couldn't mark those read."));
            }}
          >
            Mark read
          </Button>
        ) : null}
        {localNote ? <p className="mt-2 text-sm">{localNote}</p> : null}
      </article>
    </div>
  );
}

function SessionsSection({ onNote }: { onNote: (message: string) => void }) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  function load() {
    listDeviceSessions()
      .then((result) => {
        setCurrentId(result.currentId);
        setRows(result.sessions);
        setLoaded(true);
      })
      .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't load sessions."));
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <p className="text-sm text-muted">Session tokens are not shown. Revoke ends that sign-in. It does not reveal the cookie.</p>
        {!loaded ? <p className="mt-3 text-sm text-mist">Loading sessions…</p> : null}
        {loaded && rows.length === 0 ? <p className="mt-3 text-sm text-muted">No sessions were returned.</p> : null}
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((session) => {
            const current = session.id === currentId;
            return (
              <li key={session.id} className="stack-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {deviceLabel(session.user_agent)}
                    {current ? " · This device" : ""}
                  </span>
                  <span className="block text-xs text-mist">
                    Started {new Date(session.created_at).toLocaleString()}
                    {session.ip_address ? ` · ${session.ip_address}` : " · Location not available"}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-link tap"
                  onClick={() => {
                    const warning = current
                      ? "This is the device you are using. Revoking it ends this sign-in."
                      : "Sign that session out?";
                    if (!window.confirm(warning)) return;
                    revokeSession({ data: { id: session.id } })
                      .then(() => setRows((currentRows) => currentRows.filter((item) => item.id !== session.id)))
                      .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't revoke that session."));
                  }}
                >
                  Revoke
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          variant="quiet"
          className="mt-3"
          onClick={() => {
            if (!window.confirm("Sign out every device except this one?")) return;
            revokeOtherSessions()
              .then(() => {
                load();
              })
              .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't sign out the others."));
          }}
        >
          Sign out other devices
        </Button>
      </article>
    </div>
  );
}

function SecuritySection({
  onSessions,
  onApps,
  onApi,
  onNote,
  onSaved,
}: {
  onSessions: () => void;
  onApps: () => void;
  onApi: () => void;
  onNote: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sessions, setSessions] = useState(0);
  const [keys, setKeys] = useState(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  useEffect(() => {
    listSecurityEvents()
      .then(setEvents)
      .catch(() => undefined);
    listDeviceSessions()
      .then((result) => setSessions(result.sessions.length))
      .catch(() => undefined);
    listCredentials()
      .then((rows) => setKeys(rows.length))
      .catch(() => undefined);
  }, []);
  return (
    <div className="settings-stack">
      <div className="settings-stats">
        <Stat label="Sessions" value={String(sessions)} />
        <Stat label="Provider keys" value={String(keys)} />
        <Stat label="Recent events" value={String(events.length)} />
      </div>
      <article className="settings-card settings-form">
        <h2 className="text-sm font-semibold">Password</h2>
        <p className="text-xs text-mist">Works for email sign-in. Google and X keep their own passwords. Other sessions are signed out after a change.</p>
        <input className="field" type="password" autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <input className="field" type="password" autoComplete="new-password" placeholder="New password" minLength={8} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
        <Button
          disabled={currentPassword.length < 8 || nextPassword.length < 8}
          onClick={() => {
            void authClient
              .changePassword({ currentPassword, newPassword: nextPassword, revokeOtherSessions: true })
              .then(async (result) => {
                if (result.error) {
                  onNote(result.error.message || "Couldn't change the password.");
                  return;
                }
                await recordPasswordChanged();
                setCurrentPassword("");
                setNextPassword("");
                onSaved("Password updated. Other sessions were signed out.");
                listSecurityEvents().then(setEvents).catch(() => undefined);
              })
              .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't change the password."));
          }}
        >
          Update password
        </Button>
      </article>
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-muted">Not available. This sign-in system has no authenticator or recovery-code step, so it cannot be turned on here.</p>
      </article>
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={onSessions}>
          Sessions
        </Button>
        <Button variant="quiet" onClick={onApps}>
          Connected apps
        </Button>
        <Button variant="quiet" onClick={onApi}>
          Provider keys
        </Button>
      </div>
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Security history</h2>
        {events.length === 0 ? <p className="mt-2 text-sm text-muted">No events yet.</p> : null}
        <ul className="mt-2 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <span className="font-semibold">{event.kind.replaceAll("_", " ")}</span>
              <span className="text-muted"> — {event.detail}</span>
              <span className="block text-xs text-mist">{new Date(event.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

function PrivacySection({
  prefs,
  onMemory,
  onFiles,
  onDelete,
  onClear,
  onResult,
}: {
  prefs: UserSettings;
  onMemory: () => void;
  onFiles: () => void;
  onDelete: () => void;
  onClear: () => void;
  onResult: (ok: boolean, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <p className="text-sm leading-relaxed text-muted">
          Chats, files, projects, and settings are stored for your sign-in and requested only for that account. Provider keys are encrypted and are not included in an export. Tenro does not sell chats.
        </p>
        <p className="mt-2 text-sm text-muted">Saved-preference replies are {prefs.memoryEnabled ? "on" : "off"}.</p>
      </article>
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={onMemory}>
          Personalization
        </Button>
        <Button variant="quiet" onClick={onFiles}>
          Files
        </Button>
        <Button variant="quiet" onClick={onClear}>
          Clear chats
        </Button>
        <Button variant="quiet" onClick={onDelete}>
          Delete Tenro data
        </Button>
      </div>
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Export</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist">
          The file is built when you press the button and downloads immediately. It includes profile, settings, chats, messages, file names, and security events. Keys and session tokens are omitted.
        </p>
        <Button
          className="mt-3"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            exportAccount()
              .then((data) => {
                downloadText(`tenro-export-${data.exportedAt.slice(0, 10)}.json`, "application/json", JSON.stringify(data, null, 2));
                onResult(true, "Export downloaded.");
              })
              .catch((caught) => onResult(false, caught instanceof Error ? caught.message : "Couldn't export."))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Preparing…" : "Download my data"}
        </Button>
      </article>
    </div>
  );
}

function AppsSection() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const connectors = [
    { id: "drive" as const, name: "Google Drive", line: "Not checked this visit." },
    { id: "calendar" as const, name: "Google Calendar", line: "Not checked this visit." },
  ];
  const unavailable = ["Gmail", "Outlook", "Teams", "Slack", "Notion", "GitHub", "Dropbox"];
  return (
    <div className="settings-stack">
      <p className="text-sm text-muted">A connection is shown only after the connector answers. Tenro does not store a separate Drive or Calendar token to revoke.</p>
      {connectors.map((connector) => (
        <article key={connector.id} className="settings-card">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{connector.name}</h2>
              <p className="text-xs text-mist">{notes[connector.id] || connector.line}</p>
              <p className="mt-1 text-xs text-mist">Permission: read a sample when the grant exists. Last use: this check.</p>
            </div>
            <button
              type="button"
              className="text-link tap"
              disabled={busy === connector.id}
              onClick={() => {
                setBusy(connector.id);
                probeConnector({ data: { id: connector.id } })
                  .then((result) => {
                    if (result.loginUrl) window.open(result.loginUrl, "_blank", "noopener,noreferrer");
                    setNotes((current) => ({ ...current, [connector.id]: result.detail }));
                  })
                  .catch((caught) => setNotes((current) => ({ ...current, [connector.id]: caught instanceof Error ? caught.message : "Couldn't check that." })))
                  .finally(() => setBusy(""));
              }}
            >
              {busy === connector.id ? "Checking…" : "Check"}
            </button>
          </div>
        </article>
      ))}
      {unavailable.map((name) => (
        <article key={name} className="settings-card">
          <h2 className="text-sm font-semibold">{name}</h2>
          <p className="text-xs text-mist">Unavailable. There is no connector, so nothing can be disconnected.</p>
        </article>
      ))}
    </div>
  );
}

function ApiSection({ onCredential, onNote }: { onCredential: (providerId: string, hint: string | null) => void; onNote: (message: string) => void }) {
  const [hints, setHints] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState("");
  const [providerId, setProviderId] = useState("openai");
  const [usage, setUsage] = useState<{ hour: number; hourLimit: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [localNote, setLocalNote] = useState("");
  useEffect(() => {
    listCredentials()
      .then((rows) => setHints(Object.fromEntries(rows.map((row) => [row.provider_id, row.hint]))))
      .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't load keys."));
    usageSummary()
      .then((row) => setUsage({ hour: Number(row.hour), hourLimit: row.hourLimit }))
      .catch(() => undefined);
  }, []);
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Tenro API keys</h2>
        <p className="mt-1 text-sm text-muted">Tenro does not issue its own API keys, and it has no webhooks. Do not paste a provider key into a chat or a public page.</p>
        {usage ? (
          <p className="mt-2 text-sm text-muted">
            Usage this hour: {usage.hour} of {usage.hourLimit} replies.
          </p>
        ) : null}
      </article>
      {PROVIDERS.map((provider) => (
        <article key={provider.id} className="settings-card">
          <h2 className="text-sm font-semibold">{provider.name}</h2>
          <p className="text-xs text-mist">
            {provider.auth === "tenro"
              ? hints[provider.id]
                ? `Platform connection is available. A personal key is saved (${hints[provider.id]}).`
                : "Tenro can answer. No personal key is stored."
              : hints[provider.id]
                ? `Connected. Key ending ${hints[provider.id]}.`
                : "Not connected."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {provider.auth !== "tenro" && hints[provider.id] ? (
              <button
                type="button"
                className="text-link tap"
                disabled={busy === provider.id}
                onClick={() => {
                  setBusy(provider.id);
                  setLocalNote("");
                  testStoredCredential({ data: { providerId: provider.id } })
                    .then(() => setLocalNote(`${provider.name} answered.`))
                    .catch((caught) => onNote(caught instanceof Error ? caught.message : "The test failed."))
                    .finally(() => setBusy(""));
                }}
              >
                {busy === provider.id ? "Testing…" : "Test"}
              </button>
            ) : null}
            {hints[provider.id] ? (
              <button
                type="button"
                className="text-link tap"
                onClick={() => {
                  if (!window.confirm(`Delete the saved ${provider.name} key?`)) return;
                  deleteCredential({ data: { providerId: provider.id } })
                    .then(() => {
                      setHints((current) => {
                        const next = { ...current };
                        delete next[provider.id];
                        return next;
                      });
                      onCredential(provider.id, null);
                    })
                    .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't delete that key."));
                }}
              >
                Delete key
              </button>
            ) : null}
          </div>
        </article>
      ))}
      <article className="settings-card settings-form">
        <h2 className="text-sm font-semibold">Replace a key</h2>
        <p className="text-xs text-mist">The key is tested with the provider, then stored encrypted. It is not shown again.</p>
        <label className="text-sm font-semibold">
          Provider
          <select className="field mt-2" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            {PROVIDERS.filter((provider) => provider.auth !== "tenro").map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <input className="field" type="password" autoComplete="off" placeholder="Paste key" value={secret} onChange={(event) => setSecret(event.target.value)} />
        <Button
          disabled={secret.trim().length < 8 || busy === "save"}
          onClick={() => {
            setBusy("save");
            saveCredential({ data: { providerId, secret: secret.trim() } })
              .then((saved) => {
                setHints((current) => ({ ...current, [providerId]: saved.hint }));
                onCredential(providerId, saved.hint);
                setSecret("");
                setLocalNote("Key saved. It will not be shown again.");
              })
              .catch((caught) => onNote(caught instanceof Error ? caught.message : "That key was not saved."))
              .finally(() => setBusy(""));
          }}
        >
          Save key
        </Button>
        {localNote ? <p className="text-sm">{localNote}</p> : null}
      </article>
    </div>
  );
}

function FilesSection({ onNote }: { onNote: (message: string) => void }) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("note");
  const [format, setFormat] = useState("md");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<{ name: string; mime: string; body: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  function load() {
    listFiles()
      .then((rows) => {
        setFiles(rows);
        setLoaded(true);
      })
      .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't load files."));
  }
  useEffect(() => {
    load();
  }, []);
  const used = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <p className="text-sm text-muted">Stored size: {used.toLocaleString()} characters across {files.length} files.</p>
        <p className="mt-1 text-xs leading-relaxed text-mist">
          You can save text, Markdown, CSV, JSON, code, and a one-page PDF. Generated text is limited to 80,000 characters. Files belong to your account and are not tied to a project. A PDF is built on the server.
        </p>
      </article>
      {!loaded ? <p className="text-sm text-mist">Loading files…</p> : null}
      {loaded && files.length === 0 ? <p className="text-sm text-muted">No files yet.</p> : null}
      {files.map((file) => (
        <article key={file.id} className="settings-card">
          <p className="text-sm font-semibold">{file.name}</p>
          <p className="text-xs text-mist">
            {file.mime} · {file.size_bytes} stored · {new Date(file.created_at).toLocaleString()} · Not tied to a project
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                readDocument({ data: { id: file.id } })
                  .then((doc) => setPreview(doc))
                  .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't open that file."));
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                readDocument({ data: { id: file.id } })
                  .then((doc) => downloadText(doc.name, doc.mime, doc.body))
                  .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't download that file."));
              }}
            >
              Download
            </button>
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                const next = window.prompt("Rename file", file.name);
                if (!next || !next.trim()) return;
                renameFile({ data: { id: file.id, name: next.trim() } })
                  .then(() => load())
                  .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't rename that file."));
              }}
            >
              Rename
            </button>
            {file.mime !== "application/pdf" ? (
              <button
                type="button"
                className="text-link tap"
                onClick={() => {
                  readDocument({ data: { id: file.id } })
                    .then((doc) => {
                      setEditId(file.id);
                      setName(doc.name);
                      setBody(doc.mime === "application/pdf" ? "" : doc.body);
                      setFormat(formatFromMime(doc.mime));
                    })
                    .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't open that file."));
                }}
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              className="text-link tap"
              onClick={() => {
                if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
                deleteFile({ data: { id: file.id } })
                  .then(() => setFiles((current) => current.filter((item) => item.id !== file.id)))
                  .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't delete that file."));
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {preview ? (
        <article className="settings-card">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{preview.name}</p>
            <button type="button" className="text-link tap ml-auto" onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
          {preview.mime === "application/pdf" ? (
            <p className="mt-2 text-sm text-muted">PDF preview stays in the downloaded file.</p>
          ) : (
            <pre className="doc-preview">{preview.body.slice(0, 4000)}</pre>
          )}
        </article>
      ) : null}
      <article className="settings-card settings-form">
        <h2 className="text-sm font-semibold">{editId ? "Edit document" : "Create a document"}</h2>
        <input className="field" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        <select className="field" value={format} disabled={Boolean(editId)} onChange={(event) => setFormat(event.target.value)}>
          <option value="txt">Text</option>
          <option value="md">Markdown</option>
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="code">Code</option>
          <option value="pdf">PDF</option>
        </select>
        <textarea className="note" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the document" />
        <div className="flex gap-2">
          <Button
            disabled={!body.trim()}
            onClick={() => {
              const action = editId
                ? updateDocument({ data: { id: editId, body } })
                : saveDocument({ data: { name, format, body } });
              action
                .then(() => {
                  setBody("");
                  setEditId(null);
                  load();
                })
                .catch((caught) => onNote(caught instanceof Error ? caught.message : "Couldn't save that document."));
            }}
          >
            {editId ? "Save edits" : "Create file"}
          </Button>
          {editId ? (
            <Button
              variant="quiet"
              onClick={() => {
                setEditId(null);
                setBody("");
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function AccessSection({ prefs, onPatch }: { prefs: UserSettings; onPatch: (patch: Partial<UserSettings>) => void }) {
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <p className="text-sm leading-relaxed text-muted">
          Buttons keep a visible focus ring. Icons that are only decorative are hidden from screen readers. Forms have labels. Destructive actions ask before they run.
        </p>
      </article>
      <Choice
        legend="Motion"
        value={prefs.motion}
        options={[
          { id: "system", label: "System" },
          { id: "full", label: "Full" },
          { id: "reduce", label: "Reduce" },
        ]}
        onChange={(motion) => onPatch({ motion })}
      />
      <Choice
        legend="Text size"
        value={prefs.fontScale}
        options={[
          { id: "sm", label: "Small" },
          { id: "md", label: "Default" },
          { id: "lg", label: "Large" },
        ]}
        onChange={(fontScale) => onPatch({ fontScale })}
      />
      <Choice
        legend="Contrast"
        value={prefs.contrast}
        options={[
          { id: "default", label: "Default" },
          { id: "high", label: "High" },
        ]}
        onChange={(contrast) => onPatch({ contrast })}
      />
      <article className="settings-card">
        <h2 className="text-sm font-semibold">Keyboard</h2>
        <p className="mt-1 text-sm text-muted">Tab moves between controls. Enter sends a chat. Shift+Enter adds a line. Escape closes settings and the menu.</p>
      </article>
    </div>
  );
}

function LegalSection({
  selected,
  onOpen,
  onBack,
  onAccepted,
}: {
  selected: (typeof LEGAL_DOCS)[number] | null;
  onOpen: (key: string) => void;
  onBack: () => void;
  onAccepted: (message: string) => void;
}) {
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [localNote, setLocalNote] = useState("");
  useEffect(() => {
    listLegalAcceptances()
      .then((rows) => {
        const next: Record<string, string> = {};
        for (const row of rows) next[`${row.document_key}:${row.version}`] = row.accepted_at;
        setAccepted(next);
      })
      .catch(() => undefined);
  }, []);
  if (selected) {
    const stamp = accepted[`${selected.key}:${selected.version}`];
    return (
      <div className="settings-stack">
        <button type="button" className="text-link tap w-fit" onClick={onBack}>
          All documents
        </button>
        <p className="text-xs text-mist">Updated {selected.updated}. These are product rules, not an audit certificate.</p>
        <article className="settings-card">
          <p className="text-sm leading-relaxed">{selected.body}</p>
        </article>
        {stamp ? <p className="text-sm text-muted">You accepted version {selected.version} on {new Date(stamp).toLocaleString()}.</p> : null}
        <Button
          onClick={() => {
            acceptLegal({ data: { key: selected.key, version: selected.version } })
              .then(() => {
                setAccepted((current) => ({ ...current, [`${selected.key}:${selected.version}`]: new Date().toISOString() }));
                onAccepted(`Accepted ${selected.title}.`);
              })
              .catch((caught) => setLocalNote(caught instanceof Error ? caught.message : "Couldn't record that."));
          }}
        >
          {stamp ? "Accepted" : "Accept this version"}
        </Button>
        {localNote ? <p className="text-sm">{localNote}</p> : null}
      </div>
    );
  }
  return (
    <div className="settings-stack">
      {LEGAL_DOCS.map((doc) => {
        const stamp = accepted[`${doc.key}:${doc.version}`];
        return (
          <button key={doc.key} type="button" className="settings-card settings-link" onClick={() => onOpen(doc.key)}>
            <span>
              <span className="block text-sm font-semibold">{doc.title}</span>
              <span className="block text-xs text-mist">
                Version {doc.version} · Updated {doc.updated}
                {stamp ? " · Accepted" : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HelpSection({
  query,
  selected,
  onOpen,
  onBack,
}: {
  query: string;
  selected: (typeof HELP_ARTICLES)[number] | null;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const q = query.trim().toLowerCase();
  const articles = HELP_ARTICLES.filter((item) => !q || `${item.category} ${item.title} ${item.body}`.toLowerCase().includes(q));
  if (selected) {
    const related = HELP_ARTICLES.filter((item) => item.category === selected.category && item.id !== selected.id).slice(0, 3);
    return (
      <div className="settings-stack">
        <p className="text-xs text-mist">Help / {selected.category}</p>
        <button type="button" className="text-link tap w-fit" onClick={onBack}>
          All articles
        </button>
        <article className="settings-card">
          <p className="text-sm leading-relaxed">{selected.body}</p>
        </article>
        {related.length > 0 ? (
          <div>
            <p className="text-sm font-semibold">Related</p>
            {related.map((item) => (
              <button key={item.id} type="button" className="text-link tap" onClick={() => onOpen(item.id)}>
                {item.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  const categories = [...new Set(articles.map((item) => item.category))];
  return (
    <div className="settings-stack">
      {articles.length === 0 ? <p className="text-sm text-muted">No articles match that.</p> : null}
      {categories.map((category) => (
        <div key={category}>
          <p className="text-sm font-semibold">{category}</p>
          {articles
            .filter((item) => item.category === category)
            .map((item) => (
              <button key={item.id} type="button" className="settings-card settings-link mt-2 w-full" onClick={() => onOpen(item.id)}>
                <span className="text-sm font-semibold">{item.title}</span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

function DeleteSection({ email, onCleared, onFail }: { email: string | null; onCleared: () => void; onFail: (message: string) => void }) {
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  return (
    <div className="settings-stack">
      <article className="settings-card">
        <p className="text-sm leading-relaxed text-muted">
          This permanently deletes chats, files, projects, provider keys, notifications, settings, and your Tenro profile. Your sign-in stays, because this app cannot delete the login itself. You would set Tenro up again next time. Nothing here is sent to a retention archive.
        </p>
      </article>
      <article className="settings-card settings-form">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={armed} onChange={(event) => setArmed(event.target.checked)} />
          I understand this removes my Tenro data{email ? ` for ${email}` : ""}.
        </label>
        <input className="field" value={confirm} placeholder="Type DELETE" onChange={(event) => setConfirm(event.target.value)} />
        <Button
          disabled={!armed || confirm !== "DELETE"}
          onClick={() => {
            if (!window.confirm("Delete your Tenro data now? This cannot be undone.")) return;
            clearAccountData({ data: { confirm } })
              .then(() => onCleared())
              .catch((caught) => onFail(caught instanceof Error ? caught.message : "Couldn't delete that data."));
          }}
        >
          Delete my Tenro data
        </Button>
      </article>
    </div>
  );
}

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="settings-card">
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="choice-row mt-2">
        {options.map((option) => (
          <label key={option.id} className="choice">
            <input className="sr-only" type="radio" name={legend} checked={value === option.id} onChange={() => onChange(option.id)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ on, label, detail, onChange }: { on: boolean; label: string; detail?: string; onChange: (value: boolean) => void }) {
  return (
    <div className="setting-row">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {detail ? <p className="text-xs leading-relaxed text-mist">{detail}</p> : null}
      </div>
      <button type="button" className="set-toggle tap" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
        <i />
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="settings-card">
      <p className="text-xs text-mist">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </article>
  );
}

function AgentFace({ id, name }: { id: AvatarId; name: string }) {
  if (id === "smile") return <img src={smileUrl} alt="" className="avatar-face" />;
  if (id === "curious") return <img src={curiousUrl} alt="" className="avatar-face" />;
  if (id === "think") return <img src={thinkUrl} alt="" className="avatar-face" />;
  if (id === "initials") return <span className="avatar">{initials(name)}</span>;
  return <TenroMark className="size-8" />;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "T";
}

function deviceLabel(ua: string | null) {
  const value = ua || "";
  const browser = /Edg\//.test(value) ? "Edge" : /Chrome\//.test(value) ? "Chrome" : /Firefox\//.test(value) ? "Firefox" : /Safari\//.test(value) ? "Safari" : "Browser";
  const device = /iPhone|Android.+Mobile|Mobile/.test(value) ? "Phone" : /iPad|Tablet/.test(value) ? "Tablet" : "Computer";
  return `${device} · ${browser}`;
}

function formatFromMime(mime: string) {
  if (mime === "text/markdown") return "md";
  if (mime === "text/csv") return "csv";
  if (mime === "application/json") return "json";
  if (mime === "application/pdf") return "pdf";
  return "txt";
}

function downloadText(name: string, mime: string, body: string) {
  const blob =
    mime === "application/pdf"
      ? new Blob([Uint8Array.from(atob(body), (char) => char.charCodeAt(0))], { type: mime })
      : new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
