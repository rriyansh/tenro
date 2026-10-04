import { useId, useState } from "react";
import { LifeBuoy } from "lucide-react";
import agentUrl from "@/assets/tenro-agent.png";
import { Button } from "@/components/ui/button";
import { TenroMark } from "@/components/tenro/mark";
import { Sheet } from "@/components/tenro/sheet";
import { APP_TAGLINE, APP_VERSION } from "@/lib/brand";

type Panel = "terms" | "privacy" | "help" | null;

type WelcomeScreenProps = {
  onStart: () => void;
  resume?: boolean;
};

export function WelcomeScreen({ onStart, resume = false }: WelcomeScreenProps) {
  const noteId = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState("");
  const [noteSent, setNoteSent] = useState(false);

  return (
    <main className="grove min-h-dvh">
      <div className="safe-pad mx-auto flex min-h-dvh w-full max-w-md flex-col px-6">
        <header className="enter d1 flex flex-col items-center pt-2 text-center">
          <div className="flex items-center gap-2.5">
            <TenroMark />
            <h1 className="brand-type text-2xl font-semibold tracking-tight text-ink">Tenro</h1>
          </div>
          <p className="brand-type mt-3 max-w-xs text-base leading-snug font-medium text-muted">{APP_TAGLINE}</p>
        </header>

        <div className="enter d2 flex flex-1 items-center justify-center py-3">
          <div className="agent-stage">
            <div className="agent-glow" aria-hidden="true" />
            <img
              src={agentUrl}
              alt="Tenro, a small friendly AI agent with a cream face, emerald glass body, and a floating halo"
              className="agent-img"
              width={773}
              height={1129}
              draggable={false}
            />
          </div>
        </div>

        <footer className="enter d3 flex flex-col">
          <Button className="w-full" onClick={onStart}>
            {resume ? "Continue setup" : "Get Started"}
          </Button>
          <p className="mt-3 text-center text-sm leading-snug text-muted">
            <button type="button" className="legal-link tap" onClick={() => setPanel("terms")}>
              Terms of Service
            </button>
            <span aria-hidden="true"> · </span>
            <button type="button" className="legal-link tap" onClick={() => setPanel("privacy")}>
              Privacy Policy
            </button>
          </p>
          <div className="mt-2 flex flex-col items-center">
            <Button variant="quiet" onClick={() => setPanel("help")}>
              <LifeBuoy className="size-4" strokeWidth={2} />
              Help & feedback
            </Button>
            <p className="pb-1 text-xs tracking-wide text-mist">Version {APP_VERSION}</p>
            <a className="text-link tap" href="/tenro-source.zip" download="tenro-source.zip">
              Download source code
            </a>
          </div>
        </footer>
      </div>

      <Sheet
        open={panel === "terms"}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Terms of Service"
        description="The short version of how you use Tenro."
      >
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted">
          <p>Tenro is an AI agent. You ask; it takes the next step with you.</p>
          <p>
            Use it for work you are allowed to share. Don’t ask it to harm people, break the law, or
            pretend to be someone else.
          </p>
          <p>You’ll confirm these terms at the end of setup. Until then, nothing is saved as agreed.</p>
        </div>
      </Sheet>

      <Sheet
        open={panel === "privacy"}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Privacy Policy"
        description="What this version of Tenro keeps."
      >
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted">
          <p>
            Your name, preferred name, and preferences stay in this browser. They are not sent to a
            server in this version.
          </p>
          <p>Feedback you write here stays on this device as well. Clear site data to remove it.</p>
          <p>Tenro does not sell your information.</p>
        </div>
      </Sheet>

      <Sheet
        open={panel === "help"}
        onOpenChange={(open) => {
          if (!open) {
            setPanel(null);
            setNoteSent(false);
          }
        }}
        title="Help & feedback"
        description="A note for the people building Tenro."
      >
        {noteSent ? (
          <div className="flex flex-col gap-4">
            <p className="text-base leading-relaxed text-ink">Thanks. Your note stays on this device for now.</p>
            <Button className="w-full" onClick={() => setPanel(null)}>
              Close
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const text = note.trim();
              if (!text) return;
              localStorage.setItem("tenro.feedback", text);
              setNote("");
              setNoteSent(true);
            }}
          >
            <label htmlFor={noteId} className="text-sm font-medium text-ink">
              What’s going on?
            </label>
            <textarea
              id={noteId}
              className="note"
              value={note}
              maxLength={500}
              placeholder="Something unclear, or an idea for Tenro."
              onChange={(event) => setNote(event.target.value)}
            />
            <Button type="submit" className="w-full" disabled={note.trim().length === 0}>
              Send note
            </Button>
          </form>
        )}
      </Sheet>
    </main>
  );
}
