export const CAPABILITIES = [
  { id: "fast", label: "Fast" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "coding", label: "Coding" },
  { id: "tools", label: "Tools" },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["id"];

export type ProviderId = "xai" | "openai" | "anthropic" | "google" | "deepseek" | "longcat";

export type ProviderAuth = "tenro" | "user-key";

export type Provider = {
  id: ProviderId;
  name: string;
  auth: ProviderAuth;
  line: string;
};

export type ModelStatus = "available" | "unavailable";

export type ModelRecord = {
  id: string;
  provider: ProviderId;
  apiModel: string;
  name: string;
  description: string;
  capabilities: Capability[];
  contextTokens: number;
  contextLabel: string;
  vision: boolean;
  tools: boolean;
  status: ModelStatus;
};

export const PROVIDERS: readonly Provider[] = [
  { id: "xai", name: "xAI", auth: "tenro", line: "Routed by Tenro. No key to add." },
  { id: "openai", name: "OpenAI", auth: "user-key", line: "Uses your own OpenAI key." },
  { id: "anthropic", name: "Anthropic", auth: "user-key", line: "Uses your own Anthropic key." },
  { id: "google", name: "Google Gemini", auth: "user-key", line: "Uses your own Gemini key." },
  { id: "deepseek", name: "DeepSeek", auth: "user-key", line: "Uses your own DeepSeek key." },
  { id: "longcat", name: "LongCat", auth: "user-key", line: "Uses your own LongCat key." },
];

export const MODEL_CATALOG: readonly ModelRecord[] = [
  {
    id: "xai/grok-4.3",
    provider: "xai",
    apiModel: "grok-4.3",
    name: "Grok 4.3",
    description: "Balanced for everyday asks.",
    capabilities: ["coding", "tools", "vision"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "xai/grok-build",
    provider: "xai",
    apiModel: "grok-build-0.1",
    name: "Grok Build",
    description: "Quicker, lighter replies.",
    capabilities: ["fast", "coding", "tools"],
    contextTokens: 256_000,
    contextLabel: "256K",
    vision: false,
    tools: true,
    status: "available",
  },
  {
    id: "xai/grok-4.7",
    provider: "xai",
    apiModel: "grok-4.7",
    name: "Grok 4.7",
    description: "Slower, more careful thinking.",
    capabilities: ["reasoning", "vision", "coding", "tools"],
    contextTokens: 500_000,
    contextLabel: "500K",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "xai/grok-4.20",
    provider: "xai",
    apiModel: "grok-4.20-0309-reasoning",
    name: "Grok 4.20",
    description: "A long reasoning pass when the ask is thorny.",
    capabilities: ["reasoning", "vision", "tools"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "openai/gpt-4.1",
    provider: "openai",
    apiModel: "gpt-4.1",
    name: "GPT-4.1",
    description: "A strong general model for writing and tools.",
    capabilities: ["coding", "vision", "tools"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "openai/gpt-4.1-mini",
    provider: "openai",
    apiModel: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    description: "A quicker OpenAI model for short asks.",
    capabilities: ["fast", "vision", "tools"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "openai/o3",
    provider: "openai",
    apiModel: "o3",
    name: "o3",
    description: "Built for careful, step-by-step reasoning.",
    capabilities: ["reasoning", "tools"],
    contextTokens: 200_000,
    contextLabel: "200K",
    vision: false,
    tools: true,
    status: "available",
  },
  {
    id: "anthropic/claude-opus-4",
    provider: "anthropic",
    apiModel: "claude-opus-4",
    name: "Claude Opus 4",
    description: "The deepest Claude model for hard problems.",
    capabilities: ["reasoning", "coding", "vision", "tools"],
    contextTokens: 200_000,
    contextLabel: "200K",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "anthropic/claude-sonnet-4",
    provider: "anthropic",
    apiModel: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Balanced Claude for most day-to-day work.",
    capabilities: ["coding", "vision", "tools"],
    contextTokens: 200_000,
    contextLabel: "200K",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "anthropic/claude-haiku-4",
    provider: "anthropic",
    apiModel: "claude-haiku-4",
    name: "Claude Haiku 4",
    description: "Short, quick replies.",
    capabilities: ["fast", "vision", "tools"],
    contextTokens: 200_000,
    contextLabel: "200K",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "google/gemini-2.5-pro",
    provider: "google",
    apiModel: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "A long-context Gemini for harder asks.",
    capabilities: ["reasoning", "vision", "coding", "tools"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "google",
    apiModel: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "A fast Gemini for everyday questions.",
    capabilities: ["fast", "vision", "tools"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: true,
    tools: true,
    status: "available",
  },
  {
    id: "deepseek/v3.2",
    provider: "deepseek",
    apiModel: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    description: "A strong coding and general model.",
    capabilities: ["coding", "tools"],
    contextTokens: 128_000,
    contextLabel: "128K",
    vision: false,
    tools: true,
    status: "available",
  },
  {
    id: "deepseek/v3.2-speciale",
    provider: "deepseek",
    apiModel: "deepseek-v3.2-speciale",
    name: "DeepSeek V3.2 Speciale",
    description: "A deeper reasoning pass from DeepSeek.",
    capabilities: ["reasoning", "coding"],
    contextTokens: 128_000,
    contextLabel: "128K",
    vision: false,
    tools: false,
    status: "available",
  },
  {
    id: "longcat/2.0",
    provider: "longcat",
    apiModel: "LongCat-2.0",
    name: "LongCat 2.0",
    description: "LongCat’s main chat model, with a long context.",
    capabilities: ["coding", "tools"],
    contextTokens: 1_000_000,
    contextLabel: "1M",
    vision: false,
    tools: true,
    status: "available",
  },
  {
    id: "longcat/2.0-preview",
    provider: "longcat",
    apiModel: "LongCat-2.0-Preview",
    name: "LongCat 2.0 Preview",
    description: "A preview build. Not offered in Tenro yet.",
    capabilities: ["reasoning", "tools"],
    contextTokens: 128_000,
    contextLabel: "128K",
    vision: false,
    tools: true,
    status: "unavailable",
  },
];

const LEGACY_IDS: Record<string, string> = {
  tenro: "xai/grok-4.3",
  fast: "xai/grok-build",
  deep: "xai/grok-4.7",
};

const byId = new Map(MODEL_CATALOG.map((model) => [model.id, model]));

export function getProvider(id: ProviderId) {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export function getModel(id: string) {
  return byId.get(id);
}

export function isProviderConnected(id: ProviderId) {
  return getProvider(id).auth === "tenro";
}

export type ModelAvailability = "ready" | "disconnected" | "unavailable";

export function modelAvailability(model: ModelRecord): ModelAvailability {
  if (model.status !== "available") return "unavailable";
  if (!isProviderConnected(model.provider)) return "disconnected";
  return "ready";
}

export function resolveModelId(value: string | undefined | null) {
  if (value && byId.has(value)) return value;
  if (value && LEGACY_IDS[value]) return LEGACY_IDS[value];
  return "xai/grok-4.3";
}

export function preferenceModelId(preference: string) {
  return resolveModelId(preference);
}

export function modelLabel(id: string | undefined) {
  if (!id) return "";
  return getModel(resolveModelId(id))?.name ?? id;
}

export function capabilityLabel(id: Capability) {
  return CAPABILITIES.find((item) => item.id === id)?.label ?? id;
}

export function modelsFor(provider: ProviderId) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}
