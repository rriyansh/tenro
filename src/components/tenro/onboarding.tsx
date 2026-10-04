import { useEffect, useId, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import curiousUrl from "@/assets/tenro-curious.png";
import smileUrl from "@/assets/tenro-smile.png";
import thinkUrl from "@/assets/tenro-think.png";
import calmUrl from "@/assets/tenro-agent.png";
import { Button } from "@/components/ui/button";
import {
  LOOKS,
  MODELS,
  STYLES,
  cleanName,
  emptyDraft,
  firstName,
  isPersonName,
  isPreferredName,
  loadDraft,
  saveDraft,
  type Draft,
  type LookId,
  type ModelId,
  type Profile,
  type StyleId,
} from "@/lib/profile";

const FACES = [
  { src: curiousUrl, alt: "Tenro listening, head tilted with a curious look", width: 515, height: 900 },
  { src: smileUrl, alt: "Tenro smiling warmly", width: 518, height: 900 },
  { src: thinkUrl, alt: "Tenro thinking, one hand lifted", width: 600, height: 899 },
  { src: calmUrl, alt: "Tenro standing calmly with a floating halo", width: 773, height: 1129 },
] as const;

const STEPS = [
  {
    title: "What’s your name?",
    sub: "So Tenro knows who it’s working with.",
  },
  {
    title: "What should Tenro call you?",
    sub: "A first name or a nickname is perfect.",
  },
  {
    title: "Make it yours",
    sub: "Optional. The defaults are already fine.",
  },
  {
    title: "Before we begin",
    sub: "One read, then you’re in.",
  },
] as const;

type OnboardingProps = {
  onDone: (profile: Profile) => void;
};

export function Onboarding({ onDone }: OnboardingProps) {
  const nameId = useId();
  const preferredId = useId();
  const titleId = useId();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [nameError, setNameError] = useState("");
  const [preferredError, setPreferredError] = useState("");

  useEffect(() => {
    const saved = loadDraft();
    if (saved) setDraft(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (draft.step === 0) {
      document.getElementById(nameId)?.focus();
      return;
    }
    if (draft.step === 1) {
      document.getElementById(preferredId)?.focus();
      return;
    }
    document.getElementById(titleId)?.focus();
  }, [draft.step, ready, nameId, preferredId, titleId]);

  function commit(recipe: (current: Draft) => Draft) {
    setDraft((current) => {
      const next = recipe(current);
      saveDraft(next);
      return next;
    });
  }

  function go(next: number) {
    setDir(next > draft.step ? 1 : -1);
    commit((current) => ({ ...current, step: next }));
  }

  function updateName(value: string) {
    setNameError("");
    commit((current) => ({
      ...current,
      name: value,
      preferred: current.preferredTouched ? current.preferred : firstName(value),
    }));
  }

  function updatePreferred(value: string) {
    setPreferredError("");
    commit((current) => ({ ...current, preferred: value, preferredTouched: true }));
  }

  function next() {
    if (draft.step === 0) {
      const name = cleanName(draft.name);
      if (!isPersonName(name)) {
        if (!name) setNameError("Enter your name to continue.");
        else if (name.length < 2) setNameError("Enter at least two letters.");
        else setNameError("Use letters only.");
        return;
      }
      commit((current) => ({
        ...current,
        name,
        preferred: current.preferredTouched ? cleanName(current.preferred) : firstName(name),
        step: 1,
      }));
      setDir(1);
      return;
    }
    if (draft.step === 1) {
      const preferred = cleanName(draft.preferred);
      if (!isPreferredName(preferred)) {
        setPreferredError(preferred ? "Use letters only." : "Tell Tenro what to call you.");
        return;
      }
      commit((current) => ({ ...current, preferred, preferredTouched: true, step: 2 }));
      setDir(1);
      return;
    }
    if (draft.step === 2) {
      go(3);
      return;
    }
    if (!draft.agreed) return;
    const name = cleanName(draft.name);
    const preferred = cleanName(draft.preferred);
    if (!isPersonName(name) || !isPreferredName(preferred)) {
      go(isPersonName(name) ? 1 : 0);
      return;
    }
    onDone({
      name,
      preferredName: preferred,
      style: draft.style,
      model: draft.model,
      appearance: draft.appearance,
      agreedAt: new Date().toISOString(),
    });
  }

  const step = draft.step;
  const copy = STEPS[step] ?? STEPS[0];
  const compact = step >= 2;

  if (!ready) {
    return <main className="grove min-h-dvh" aria-busy="true" />;
  }

  return (
    <main className="grove min-h-dvh" data-appearance={draft.appearance}>
      <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-md flex-col px-6">
        <header className="onboard-head shrink-0">
          {step > 0 ? (
            <button type="button" className="back-btn tap" onClick={() => go(step - 1)}>
              <ChevronLeft className="size-5" strokeWidth={2.25} />
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="text-center">
            <p className="text-sm font-medium text-mist tabular-nums">
              {step + 1} of {STEPS.length}
            </p>
            <div
              className="dots mt-2"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={step + 1}
              aria-label="Setup progress"
            >
              {STEPS.map((item, index) => (
                <span key={item.title} className={index <= step ? "dot on" : "dot"} />
              ))}
            </div>
          </div>
          <span />
        </header>

        <div
          className={
            compact
              ? "agent-stage onboard compact mx-auto shrink-0"
              : "agent-stage onboard mx-auto shrink-0"
          }
        >
          <div className="agent-glow" aria-hidden="true" />
          <div className="face-stack" data-pose={String(step)}>
            {FACES.map((face, index) => (
              <img
                key={face.src}
                src={face.src}
                alt={index === step ? face.alt : ""}
                aria-hidden={index === step ? undefined : true}
                className={index === step ? "face on" : "face"}
                width={face.width}
                height={face.height}
                draggable={false}
              />
            ))}
          </div>
        </div>

        <div className="step-clip flex min-h-0 flex-1 flex-col">
          <div key={step} className={dir > 0 ? "step-next flex min-h-0 flex-1 flex-col" : "step-prev flex min-h-0 flex-1 flex-col"}>
            <div className="min-h-0 flex-1 overflow-y-auto pt-2 pb-4">
              <h1 id={titleId} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-ink outline-none">
                {copy.title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">{copy.sub}</p>

              {step === 0 ? (
                <div className="mt-5">
                  <label htmlFor={nameId} className="text-sm font-medium text-ink">
                    Full name
                  </label>
                  <input
                    id={nameId}
                    className="field mt-2"
                    value={draft.name}
                    autoComplete="name"
                    enterKeyHint="next"
                    maxLength={40}
                    placeholder="Ada Lovelace"
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={nameError ? "name-error" : undefined}
                    onChange={(event) => updateName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        next();
                      }
                    }}
                  />
                  <p id="name-error" className="mt-2 min-h-5 text-sm text-ink" role="status">
                    {nameError}
                  </p>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="mt-5">
                  <label htmlFor={preferredId} className="text-sm font-medium text-ink">
                    Preferred name
                  </label>
                  <input
                    id={preferredId}
                    className="field mt-2"
                    value={draft.preferred}
                    autoComplete="nickname"
                    enterKeyHint="next"
                    maxLength={24}
                    placeholder="Ada"
                    aria-invalid={preferredError ? true : undefined}
                    aria-describedby={preferredError ? "preferred-error" : undefined}
                    onChange={(event) => updatePreferred(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        next();
                      }
                    }}
                  />
                  <p id="preferred-error" className="mt-2 min-h-5 text-sm text-ink" role="status">
                    {preferredError}
                  </p>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="mt-5 flex flex-col gap-5">
                  <ChoiceGroup
                    legend="How should Tenro talk?"
                    name="style"
                    value={draft.style}
                    options={STYLES}
                    onChange={(style) => commit((current) => ({ ...current, style }))}
                  />
                  <ChoiceGroup
                    legend="Default model"
                    name="model"
                    value={draft.model}
                    options={MODELS}
                    onChange={(model) => commit((current) => ({ ...current, model }))}
                  />
                  <fieldset>
                    <legend className="text-sm font-semibold text-ink">Appearance</legend>
                    <div className="choice-row mt-2">
                      {LOOKS.map((look) => (
                        <label key={look.id} className="choice">
                          <input
                            className="sr-only"
                            type="radio"
                            name="appearance"
                            value={look.id}
                            checked={draft.appearance === look.id}
                            onChange={() =>
                              commit((current) => ({ ...current, appearance: look.id }))
                            }
                          />
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`swatch swatch-${look.id}`} aria-hidden="true" />
                            {look.label}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 min-h-5 text-sm text-muted">
                      {LOOKS.find((look) => look.id === draft.appearance)?.line}
                    </p>
                  </fieldset>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="mt-4">
                  <div className="legal-card text-sm leading-relaxed text-muted">
                    <h2 className="text-base font-semibold text-ink">Terms of Service</h2>
                    <p className="mt-2">
                      Tenro is an AI agent. You ask, and it takes the next step with you.
                    </p>
                    <p className="mt-2">
                      Use it for work you are allowed to share. Don’t ask it to harm people, break the
                      law, or pretend to be someone else.
                    </p>
                    <p className="mt-2">
                      Your name, what Tenro calls you, and the preferences on the last screen stay on
                      this device in this version.
                    </p>
                    <h2 className="mt-4 text-base font-semibold text-ink">Privacy Policy</h2>
                    <p className="mt-2">
                      This version keeps your setup and anything you hand Tenro in this browser only.
                      It is not sent to a server.
                    </p>
                    <p className="mt-2">
                      Tenro does not sell your information. Clear this site’s data in the browser to
                      erase it.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-1">
                    <input
                      id="tenro-finish-agree"
                      className="agree-input"
                      type="checkbox"
                      checked={draft.agreed}
                      onChange={(event) =>
                        commit((current) => ({ ...current, agreed: event.target.checked }))
                      }
                    />
                    <label className="agree-hit" htmlFor="tenro-finish-agree">
                      <span className="agree-box">
                        <Check className="agree-tick size-3.5" strokeWidth={3} />
                      </span>
                    </label>
                    <p className="text-sm leading-snug text-muted">
                      I agree to the Terms of Service and Privacy Policy.
                    </p>
                  </div>
                  <p className="min-h-5 pl-12 text-sm text-mist" role="status">
                    {draft.agreed ? "" : "Required to finish."}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="pt-2 pb-1">
              <Button className="w-full" disabled={step === 3 && !draft.agreed} onClick={next}>
                {step === 3 ? "Finish" : "Continue"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ChoiceGroup<T extends StyleId | ModelId | LookId>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly { id: T; label: string; line: string }[];
  onChange: (id: T) => void;
}) {
  const current = options.find((option) => option.id === value);
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <div className="choice-row mt-2">
        {options.map((option) => (
          <label key={option.id} className="choice">
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="mt-2 min-h-5 text-sm text-muted">{current?.line}</p>
    </fieldset>
  );
}
