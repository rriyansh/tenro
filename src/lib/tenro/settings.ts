export type ThemeId = "system" | "dark" | "light";
export type DensityId = "comfortable" | "compact";
export type FontScale = "sm" | "md" | "lg";
export type MotionId = "system" | "full" | "reduce";
export type ContrastId = "default" | "high";
export type LengthId = "short" | "normal" | "long";
export type AvatarId = "mark" | "smile" | "curious" | "think" | "initials";

export type UserSettings = {
  username: string | null;
  avatarId: AvatarId;
  language: string;
  timezone: string;
  theme: ThemeId;
  density: DensityId;
  fontScale: FontScale;
  motion: MotionId;
  contrast: ContrastId;
  responseLength: LengthId;
  streaming: boolean;
  confirmTools: boolean;
  confirmDelete: boolean;
  markdown: boolean;
  autoTitle: boolean;
  memoryEnabled: boolean;
  notifyInApp: boolean;
  notifyAgent: boolean;
  notifySecurity: boolean;
  notifyAccount: boolean;
  notifyProvider: boolean;
};

export const DEFAULT_SETTINGS: UserSettings = {
  username: null,
  avatarId: "mark",
  language: "en",
  timezone: "UTC",
  theme: "system",
  density: "comfortable",
  fontScale: "md",
  motion: "system",
  contrast: "default",
  responseLength: "normal",
  streaming: true,
  confirmTools: true,
  confirmDelete: true,
  markdown: true,
  autoTitle: true,
  memoryEnabled: false,
  notifyInApp: true,
  notifyAgent: true,
  notifySecurity: true,
  notifyAccount: true,
  notifyProvider: true,
};

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "es", label: "Spanish" },
] as const;

export const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
] as const;

const AVATARS: AvatarId[] = ["mark", "smile", "curious", "think", "initials"];

function flag(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "t") return true;
  if (value === "false" || value === "f") return false;
  return fallback;
}

export function mapSettings(row: object | null): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const data = row as Record<string, unknown>;
  const avatar = data.avatar_id;
  const language = data.language;
  const theme = data.theme;
  const density = data.density;
  const fontScale = data.font_scale;
  const motion = data.motion;
  const contrast = data.contrast;
  const responseLength = data.response_length;
  return {
    username: typeof data.username === "string" && data.username ? data.username : null,
    avatarId: AVATARS.includes(avatar as AvatarId) ? (avatar as AvatarId) : "mark",
    language: LANGUAGES.some((item) => item.id === language) ? String(language) : "en",
    timezone: typeof data.timezone === "string" && data.timezone ? data.timezone : "UTC",
    theme: theme === "dark" || theme === "light" || theme === "system" ? theme : "system",
    density: density === "compact" ? "compact" : "comfortable",
    fontScale: fontScale === "sm" || fontScale === "lg" ? fontScale : "md",
    motion: motion === "full" || motion === "reduce" || motion === "system" ? motion : "system",
    contrast: contrast === "high" ? "high" : "default",
    responseLength: responseLength === "short" || responseLength === "long" ? responseLength : "normal",
    streaming: flag(data.streaming, true),
    confirmTools: flag(data.confirm_tools, true),
    confirmDelete: flag(data.confirm_delete, true),
    markdown: flag(data.markdown, true),
    autoTitle: flag(data.auto_title, true),
    memoryEnabled: flag(data.memory_enabled, false),
    notifyInApp: flag(data.notify_in_app, true),
    notifyAgent: flag(data.notify_agent, true),
    notifySecurity: flag(data.notify_security, true),
    notifyAccount: flag(data.notify_account, true),
    notifyProvider: flag(data.notify_provider, true),
  };
}

export function applyDocumentSettings(settings: UserSettings, appearance: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.dataset.theme = resolveTheme(settings.theme, dark);
  root.dataset.density = settings.density;
  root.dataset.font = settings.fontScale;
  root.dataset.motion = settings.motion === "reduce" || (settings.motion === "system" && reduce) ? "reduce" : "full";
  root.dataset.contrast = settings.contrast;
  root.dataset.look = appearance;
}

export const LEGAL_DOCS = [
  {
    key: "terms",
    title: "Terms of Service",
    version: "2026-10-03",
    updated: "3 October 2026",
    body: "Tenro is a personal AI workspace. You keep ownership of what you write. Do not use Tenro to break the law, attack other people, or hide who you are when an action needs your permission. Model answers can be wrong. Check anything important before you rely on it. These terms are the product rules for this app. They are not a certificate of legal compliance.",
  },
  {
    key: "privacy",
    title: "Privacy Policy",
    version: "2026-10-03",
    updated: "3 October 2026",
    body: "Your chats, files, projects, and settings are stored for your account and queried only for that account. Provider keys are encrypted and are not shown again after you save them. Tenro does not sell your chats. Export and deletion are available in Privacy & Data. This page describes how this app handles data. It is not a claim that a particular privacy law has been audited.",
  },
  {
    key: "cookies",
    title: "Cookies and sign-in",
    version: "2026-10-03",
    updated: "3 October 2026",
    body: "Sign-in uses a session cookie on this site, or a session token in the embedded preview. The cookie keeps you signed in when you chose Keep me signed in. Tenro does not add a separate advertising tracker.",
  },
  {
    key: "ai",
    title: "AI usage guidelines",
    version: "2026-10-03",
    updated: "3 October 2026",
    body: "Replies come from the model you pick. xAI can answer with Tenro\u2019s platform key. Other providers answer only after you connect your own key. Agent mode can read the clock and your project names. Creating a project still waits for your approval. Tenro will not pretend a tool ran if it did not.",
  },
  {
    key: "use",
    title: "Acceptable use",
    version: "2026-10-03",
    updated: "3 October 2026",
    body: "Do not attempt to access another person\u2019s chats, keys, or files. Do not upload secrets you are not allowed to store. Do not try to bypass the hourly message limit or the approval step for creating projects.",
  },
] as const;

export const HELP_ARTICLES = [
  {
    id: "start",
    category: "Getting started",
    title: "Start a chat",
    body: "After sign-in, type in Ask Tenro anything and send. Suggestion cards fill the composer. New chat clears the thread without deleting history.",
  },
  {
    id: "models",
    category: "Models",
    title: "Models and providers",
    body: "Grok models answer with Tenro\u2019s xAI connection. OpenAI, Anthropic, Gemini, DeepSeek, and LongCat need your own key. The key is checked with the provider, then stored encrypted. Only the last four characters are shown.",
  },
  {
    id: "agent",
    category: "Agents",
    title: "Agent mode",
    body: "Agent can read the clock and list your projects. If it wants to create a project, you get an approval. Approving creates it. Denying does not. Tenro does not control your computer.",
  },
  {
    id: "files",
    category: "Files",
    title: "Files and documents",
    body: "Text, Markdown, CSV, JSON, and code can be saved to your account. A PDF is generated on the server from the text you provide. Images and other people\u2019s cloud drives are not stored as files here.",
  },
  {
    id: "privacy",
    category: "Privacy",
    title: "What is stored",
    body: "Chats, settings, and files belong to your user id. Memory is off until you turn it on, and even then Tenro only keeps the preferences on this page. It does not build a hidden profile.",
  },
  {
    id: "security",
    category: "Security",
    title: "Sessions and password",
    body: "Sessions & Devices lists sign-ins for this account. Revoke ends that session. Sign out of other devices keeps this one. Two-factor authentication is not offered by this sign-in system.",
  },
  {
    id: "connectors",
    category: "Connectors",
    title: "Connected apps",
    body: "Google Drive and Google Calendar can be checked when this session has a connector grant. If the check says not connected, Tenro will not read those accounts. Gmail, Slack, Notion, and GitHub are not linked.",
  },
  {
    id: "keys",
    category: "API",
    title: "Do not share keys",
    body: "A provider key is a secret. Tenro never shows it again after saving. There is no Tenro API key to copy into other apps. If a test fails, nothing new is stored.",
  },
  {
    id: "shortcuts",
    category: "Help",
    title: "Keyboard",
    body: "Enter sends a message. Shift+Enter adds a line. Escape closes the menu and settings. Buttons show a focus ring when you tab to them.",
  },
  {
    id: "access",
    category: "Accessibility",
    title: "Text size, contrast, and motion",
    body: "Appearance and Accessibility change type size, density, contrast, and motion for the whole app. Reduced motion shortens animation. High contrast strengthens text and borders. These are preferences, not a certification.",
  },
  {
    id: "history",
    category: "Chats",
    title: "History, archive, and delete",
    body: "The menu lists recent chats and can search titles. Archive hides a chat without deleting it. Delete removes that conversation. Clear chat history removes every conversation after you type CLEAR.",
  },
  {
    id: "export",
    category: "Privacy",
    title: "Export your data",
    body: "Privacy & Data builds a JSON file of your profile, settings, chats, messages, file names, and security events. Provider keys and session tokens are left out. The file downloads only after you press the button.",
  },
  {
    id: "trouble",
    category: "Troubleshooting",
    title: "A reply didn't arrive",
    body: "Check the model chip. If the provider says it needs a key, add one in API & Developer and run Test. If you hit the hourly limit, wait. If a connector says it has no grant, Tenro did not read that account.",
  },
] as const;

export function resolveTheme(theme: ThemeId, prefersDark: boolean) {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}
