export const PROFILE_KEY = "tenro.profile";
export const DRAFT_KEY = "tenro.draft";
export const ASKS_KEY = "tenro.asks";

export const STYLES = [
  { id: "calm", label: "Calm", line: "Steady, unhurried, and clear." },
  { id: "direct", label: "Direct", line: "Short answers. No extra talk." },
  { id: "bright", label: "Bright", line: "Warm, quick, and a little playful." },
] as const;

export const MODELS = [
  { id: "tenro", label: "Tenro", line: "Balanced for everyday asks." },
  { id: "fast", label: "Fast", line: "Quicker, lighter replies." },
  { id: "deep", label: "Deep", line: "Slower, more careful thinking." },
] as const;

export const LOOKS = [
  { id: "grove", label: "Grove", line: "The deep green Tenro is known for." },
  { id: "dusk", label: "Dusk", line: "Darker, quieter, less glow." },
  { id: "dawn", label: "Dawn", line: "A lighter pine, still green." },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];
export type ModelId = (typeof MODELS)[number]["id"];
export type LookId = (typeof LOOKS)[number]["id"];

export type Profile = {
  name: string;
  preferredName: string;
  style: StyleId;
  model: ModelId;
  appearance: LookId;
  agreedAt: string;
};

export type Draft = {
  step: number;
  name: string;
  preferred: string;
  preferredTouched: boolean;
  style: StyleId;
  model: ModelId;
  appearance: LookId;
  agreed: boolean;
};

export type Ask = {
  id: string;
  text: string;
  at: number;
};

const NAME_PATTERN = /^[\p{L}][\p{L}\s'’.-]*$/u;

export function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isPersonName(value: string) {
  const name = cleanName(value);
  return name.length >= 2 && name.length <= 40 && NAME_PATTERN.test(name);
}

export function isPreferredName(value: string) {
  const name = cleanName(value);
  return name.length >= 1 && name.length <= 24 && NAME_PATTERN.test(name);
}

export function firstName(value: string) {
  const token = cleanName(value).split(" ")[0] ?? "";
  return token.slice(0, 24);
}

export function emptyDraft(): Draft {
  return {
    step: 0,
    name: "",
    preferred: "",
    preferredTouched: false,
    style: "calm",
    model: "tenro",
    appearance: "grove",
    agreed: false,
  };
}

function isStyle(value: unknown): value is StyleId {
  return STYLES.some((item) => item.id === value);
}

function isModel(value: unknown): value is ModelId {
  return MODELS.some((item) => item.id === value);
}

function isLook(value: unknown): value is LookId {
  return LOOKS.some((item) => item.id === value);
}

export function loadProfile(): Profile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Profile>;
    if (!data.name || !data.preferredName || !data.agreedAt) return null;
    if (!isStyle(data.style) || !isModel(data.model) || !isLook(data.appearance)) return null;
    return {
      name: data.name,
      preferredName: data.preferredName,
      style: data.style,
      model: data.model,
      appearance: data.appearance,
      agreedAt: data.agreedAt,
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  sessionStorage.removeItem(DRAFT_KEY);
}

export function loadDraft(): Draft | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Draft>;
    const base = emptyDraft();
    return {
      step: typeof data.step === "number" ? Math.min(3, Math.max(0, data.step)) : 0,
      name: typeof data.name === "string" ? data.name : base.name,
      preferred: typeof data.preferred === "string" ? data.preferred : base.preferred,
      preferredTouched: Boolean(data.preferredTouched),
      style: isStyle(data.style) ? data.style : base.style,
      model: isModel(data.model) ? data.model : base.model,
      appearance: isLook(data.appearance) ? data.appearance : base.appearance,
      agreed: Boolean(data.agreed),
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function hasDraft() {
  return loadDraft() !== null;
}

export function loadAsks(): Ask[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ASKS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Ask[];
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && typeof item.text === "string" && typeof item.id === "string");
  } catch {
    return [];
  }
}

export function saveAsks(asks: Ask[]) {
  localStorage.setItem(ASKS_KEY, JSON.stringify(asks.slice(0, 20)));
}
