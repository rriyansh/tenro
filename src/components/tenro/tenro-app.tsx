import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Onboarding } from "@/components/tenro/onboarding";
import { TenroMark } from "@/components/tenro/mark";
import { WelcomeScreen } from "@/components/tenro/welcome-screen";
import { Workspace } from "@/components/tenro/workspace";
import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { getProfile, saveProfile, type ProfileRow } from "@/lib/tenro/api";
import { preferenceModelId } from "@/lib/tenro/models";
import type { Profile } from "@/lib/profile";

export function TenroApp() {
  const { user, isPending } = useCurrentUserState();
  const [held, setHeld] = useState<AppUser | null>(null);
  const navigate = useNavigate();
  const active = user ?? (isPending ? held : null);

  useEffect(() => {
    if (user) setHeld(user);
  }, [user]);

  if (isPending && !active) {
    return (
      <main className="grove flex min-h-dvh items-center justify-center" aria-busy="true">
        <TenroMark className="size-10" />
        <p className="brand-type ml-2 text-base font-semibold">Tenro</p>
      </main>
    );
  }

  if (!active) {
    return <WelcomeScreen resume={false} onStart={() => navigate({ to: "/login" })} />;
  }

  return <SignedInHome />;
}

function SignedInHome() {
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    getProfile()
      .then((row) => {
        if (!stop) setProfile(row);
      })
      .catch((caught) => {
        if (!stop) setError(caught instanceof Error ? caught.message : "Couldn't load your account.");
      });
    return () => {
      stop = true;
    };
  }, []);

  if (error) {
    return (
      <main className="grove min-h-dvh px-6 pt-16">
        <p className="text-sm text-ink">{error}</p>
      </main>
    );
  }

  if (profile === undefined) {
    return <main className="grove min-h-dvh" aria-busy="true" />;
  }

  if (!profile) {
    return (
      <Onboarding
        onDone={(next) => {
          void saveProfile({
            data: {
              name: next.name,
              preferredName: next.preferredName,
              style: next.style,
              appearance: next.appearance,
              model: next.model,
            },
          }).then(() => {
            setProfile({
              name: next.name,
              preferredName: next.preferredName,
              style: next.style,
              appearance: next.appearance,
              defaultModelId: preferenceModelId(next.model),
              role: "user",
            });
          });
        }}
      />
    );
  }

  const view: Profile = {
    name: profile.name,
    preferredName: profile.preferredName,
    style: profile.style === "direct" || profile.style === "bright" ? profile.style : "calm",
    appearance: profile.appearance === "dusk" || profile.appearance === "dawn" ? profile.appearance : "grove",
    model: "tenro",
    agreedAt: new Date().toISOString(),
  };

  return (
    <Workspace
      profile={view}
      initialModelId={profile.defaultModelId}
      role={profile.role}
      onDataCleared={() => setProfile(null)}
      onDefaultModel={(modelId) => setProfile({ ...profile, defaultModelId: modelId })}
      onProfileChange={(next) => {
        void saveProfile({
          data: {
            name: next.name,
            preferredName: next.preferredName,
            style: next.style,
            appearance: next.appearance,
            model: profile.defaultModelId,
          },
        });
        setProfile({
          ...profile,
          name: next.name,
          preferredName: next.preferredName,
          style: next.style,
          appearance: next.appearance,
        });
      }}
    />
  );
}
