import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CAPABILITIES,
  MODEL_CATALOG,
  PROVIDERS,
  capabilityLabel,
  getProvider,
  isProviderConnected,
  modelsFor,
  type Capability,
  type ModelRecord,
  type ProviderId,
} from "@/lib/tenro/models";

type Filter = "all" | "connected" | Capability;

type ModelBrowserProps = {
  wide: boolean;
  selectedId: string;
  connectFor: ProviderId | null;
  connectedIds: string[];
  onClose: () => void;
  onBack: () => void;
  onSelect: (id: string) => void;
  onConnect: (provider: ProviderId) => void;
  onSaveKey: (provider: ProviderId, secret: string) => Promise<string>;
};

export function ModelBrowser({
  wide,
  selectedId,
  connectFor,
  connectedIds,
  onClose,
  onBack,
  onSelect,
  onConnect,
  onSaveKey,
}: ModelBrowserProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (connectFor) onBack();
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectFor, onBack, onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MODEL_CATALOG.filter((model) => {
      if (filter === "connected" && !(connectedIds.includes(model.provider) || isProviderConnected(model.provider))) return false;
      if (filter !== "all" && filter !== "connected" && !model.capabilities.includes(filter)) return false;
      if (!needle) return true;
      const provider = getProvider(model.provider).name.toLowerCase();
      const badges = model.capabilities.map((item) => capabilityLabel(item).toLowerCase()).join(" ");
      return [model.name, model.description, provider, badges].join(" ").toLowerCase().includes(needle);
    });
  }, [connectedIds, filter, query]);

  return (
    <>
      <button type="button" className="model-backdrop" aria-label="Close models" onClick={onClose} />
      <section
        className="model-browser"
        data-place={wide ? "side" : "sheet"}
        role="dialog"
        aria-modal="true"
        aria-label={connectFor ? `Connect ${getProvider(connectFor).name}` : "Models"}
      >
        {connectFor ? (
          <ConnectProvider provider={connectFor} onBack={onBack} onClose={onClose} onSaveKey={onSaveKey} />
        ) : (
          <>
            <header className="model-browser-head">
              {!wide ? <span className="sheet-grab" aria-hidden="true" /> : null}
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Models</h2>
                <button type="button" className="icon-btn tap ml-auto" aria-label="Close models" onClick={onClose}>
                  <X className="size-5" />
                </button>
              </div>
              <label htmlFor={searchId} className="sr-only">
                Search models
              </label>
              <input
                id={searchId}
                className="field mt-3"
                value={query}
                placeholder="Search models"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="filter-row mt-3" role="toolbar" aria-label="Filter models">
                <FilterChip current={filter} id="all" label="All" onPick={setFilter} />
                <FilterChip current={filter} id="connected" label="Connected" onPick={setFilter} />
                {CAPABILITIES.map((item) => (
                  <FilterChip key={item.id} current={filter} id={item.id} label={item.label} onPick={setFilter} />
                ))}
              </div>
            </header>
            <div className="model-browser-scroll">
              {PROVIDERS.map((provider) => {
                const models = visible.filter((model) => model.provider === provider.id);
                if (models.length === 0) return null;
                const connected = connectedIds.includes(provider.id) || isProviderConnected(provider.id);
                return (
                  <section key={provider.id} className="mt-4" aria-labelledby={`provider-${provider.id}`}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <h3 id={`provider-${provider.id}`} className="text-sm font-semibold">
                        {provider.name}
                      </h3>
                      {connected ? (
                        <span className="status-pill">Connected</span>
                      ) : (
                        <button type="button" className="text-link tap" onClick={() => onConnect(provider.id)}>
                          Connect
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2" role="radiogroup" aria-label={provider.name}>
                      {models.map((model) => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          selected={model.id === selectedId}
                          connected={connected}
                          onSelect={onSelect}
                          onBlocked={(message) => setNote(message)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {visible.length === 0 ? <p className="mt-6 text-sm text-muted">No models match that.</p> : null}
              {note ? (
                <p className="mt-4 text-sm text-ink" role="status">
                  {note}
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function FilterChip({
  current,
  id,
  label,
  onPick,
}: {
  current: Filter;
  id: Filter;
  label: string;
  onPick: (id: Filter) => void;
}) {
  const on = current === id;
  return (
    <button type="button" className={on ? "filter-chip tap on" : "filter-chip tap"} aria-pressed={on} onClick={() => onPick(id)}>
      {label}
    </button>
  );
}

function ModelCard({
  model,
  selected,
  connected,
  onSelect,
  onBlocked,
}: {
  model: ModelRecord;
  selected: boolean;
  connected: boolean;
  onSelect: (id: string) => void;
  onBlocked: (message: string) => void;
}) {
  const availability = model.status !== "available" ? "unavailable" : connected ? "ready" : "disconnected";
  const provider = getProvider(model.provider);
  if (availability === "unavailable") {
    return (
      <button
        type="button"
        className="model-card tap"
        aria-disabled="true"
        onClick={() => onBlocked(`${model.name} isn't available in Tenro yet.`)}
      >
        <CardBody model={model} provider={provider.name} selected={false} status="Unavailable" />
      </button>
    );
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="model-card tap"
      onClick={() => onSelect(model.id)}
    >
      <CardBody
        model={model}
        provider={provider.name}
        selected={selected}
        status={availability === "disconnected" ? "Not connected" : undefined}
      />
    </button>
  );
}

function CardBody({
  model,
  provider,
  selected,
  status,
}: {
  model: ModelRecord;
  provider: string;
  selected: boolean;
  status?: string;
}) {
  return (
    <>
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{model.name}</span>
          <span className="mt-0.5 block text-xs text-mist">
            {provider} · {model.contextLabel} context
          </span>
        </span>
        {selected ? (
          <span className="check-pop" aria-hidden="true">
            <Check className="size-4" strokeWidth={2.5} />
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 block text-sm leading-snug text-muted">{model.description}</span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        {model.capabilities.map((item) => (
          <span key={item} className="badge">
            {capabilityLabel(item)}
          </span>
        ))}
        {status ? <span className="status-pill">{status}</span> : null}
      </span>
    </>
  );
}

function ConnectProvider({
  provider,
  onBack,
  onClose,
  onSaveKey,
}: {
  provider: ProviderId;
  onBack: () => void;
  onClose: () => void;
  onSaveKey: (provider: ProviderId, secret: string) => Promise<string>;
}) {
  const fieldId = useId();
  const info = getProvider(provider);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState(false);
  const names = modelsFor(provider)
    .filter((model) => model.status === "available")
    .map((model) => model.name);

  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const entered = secret.trim();
    setSecret("");
    if (entered.length < 8) {
      setInvalid(true);
      setMessage("Enter the key from your provider.");
      return;
    }
    setPending(true);
    setInvalid(false);
    try {
      const hint = await onSaveKey(provider, entered);
      setMessage(`${info.name} is connected. Tenro stored it encrypted and will only show ${hint}.`);
    } catch (caught) {
      setInvalid(true);
      setMessage(caught instanceof Error ? caught.message : "Couldn't verify that key.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <header className="model-browser-head">
        <div className="flex items-center gap-1">
          <button type="button" className="back-btn tap" onClick={onBack}>
            <ArrowLeft className="size-5" />
            Back
          </button>
          <button type="button" className="icon-btn tap ml-auto" aria-label="Close models" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Connect {info.name}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{info.line}</p>
      </header>
      <form className="model-browser-scroll" onSubmit={submit}>
        <p className="text-sm leading-relaxed text-muted">
          {names.length ? `A working key unlocks ${names.join(", ")}.` : "No models are ready for this provider yet."}{" "}
          Tenro checks the key with the provider, then stores only an encrypted copy.
        </p>
        <label htmlFor={fieldId} className="mt-4 block text-sm font-semibold">
          API key
        </label>
        <input
          id={fieldId}
          className="field mt-2"
          type="password"
          value={secret}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          placeholder="Paste a key"
          onChange={(event) => {
            setSecret(event.target.value);
            setInvalid(false);
          }}
        />
        {message ? (
          <p className="mt-3 text-sm leading-relaxed text-ink" role="status">
            {message}
          </p>
        ) : null}
        <Button className="mt-5 w-full" type="submit" disabled={pending}>
          {pending ? "Checking key…" : "Add API key"}
        </Button>
        <Button className="mt-2 w-full" type="button" variant="quiet" onClick={onBack}>
          Not now
        </Button>
      </form>
    </>
  );
}
