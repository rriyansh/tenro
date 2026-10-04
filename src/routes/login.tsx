import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TenroMark } from "@/components/tenro/mark";
import { Button } from "@/components/ui/button";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [stay, setStay] = useState(true);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      if (mode === "up") {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email,
          callbackURL: "/",
        });
        if (result.error) throw new Error(result.error.message ?? "Couldn't create the account.");
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/",
          rememberMe: stay,
        });
        if (result.error) throw new Error(result.error.message ?? "Couldn't sign in.");
      }
      await navigate({ to: "/" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grove min-h-dvh">
      <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <TenroMark />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Sign in to Tenro</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Use Gmail, or your email and a password. Tenro keeps this device signed in.
        </p>
        {authEnabled ? (
          <>
            <div className="mt-6 flex flex-col gap-2">
              {GROK_PROVIDERS.map((provider) => (
                <Button
                  key={provider.providerId}
                  variant="quiet"
                  className="w-full"
                  onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                >
                  Continue with {provider.providerId === "grok-google" ? "Gmail" : provider.label}
                </Button>
              ))}
            </div>
            <form className="mt-6 flex flex-col gap-3" onSubmit={submit}>
              {mode === "up" ? (
                <input className="field" value={name} placeholder="Name" autoComplete="name" onChange={(event) => setName(event.target.value)} />
              ) : null}
              <input
                className="field"
                type="email"
                required
                value={email}
                placeholder="Gmail or email"
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className="field"
                type="password"
                required
                minLength={8}
                value={password}
                placeholder="Password"
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                onChange={(event) => setPassword(event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={stay} onChange={(event) => setStay(event.target.checked)} />
                Keep me signed in
              </label>
              {error ? (
                <p className="text-sm text-ink" role="status">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
              </Button>
              <button
                type="button"
                className="text-link tap"
                onClick={() => {
                  setMode(mode === "up" ? "in" : "up");
                  setError("");
                }}
              >
                {mode === "up" ? "I already have an account" : "Create an account"}
              </button>
            </form>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">Sign-in is turned off.</p>
        )}
      </div>
    </main>
  );
}
