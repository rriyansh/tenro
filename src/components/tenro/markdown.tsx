import { useState } from "react";

function escapeText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "\u0026quot;");
}
function inline(source: string) {
  const text = escapeText(source);
  const withCode = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  const withBold = withCode.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
}

export function Markdown({
  text,
  plain = false,
  onSaveCode,
}: {
  text: string;
  plain?: boolean;
  onSaveCode?: (code: string, language: string) => void;
}) {
  if (plain) {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>;
  }
  const blocks = text.replaceAll("\r\n", "\n").split(/```/);
  return (
    <div className="md text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const lineBreak = block.indexOf("\n");
          const language = lineBreak === -1 ? "" : block.slice(0, lineBreak).trim();
          const code = lineBreak === -1 ? block : block.slice(lineBreak + 1);
          return <CodeBlock key={index} code={code.replace(/\n$/, "")} language={language} onSave={onSaveCode} />;
        }
        return <Prose key={index} text={block} />;
      })}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  const chunks = text.split(/\n{2,}/).filter((chunk) => chunk.trim());
  return (
    <>
      {chunks.map((chunk, index) => {
        const lines = chunk.split("\n");
        const list = lines.every((line) => /^\s*[-*]\s+/.test(line));
        if (list) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} dangerouslySetInnerHTML={{ __html: inline(line.replace(/^\s*[-*]\s+/, "")) }} />
              ))}
            </ul>
          );
        }
        const heading = chunk.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          return <p key={index} className="md-heading" dangerouslySetInnerHTML={{ __html: inline(heading[2] ?? "") }} />;
        }
        return <p key={index} dangerouslySetInnerHTML={{ __html: inline(chunk).replaceAll("\n", "<br />") }} />;
      })}
    </>
  );
}

function CodeBlock({
  code,
  language,
  onSave,
}: {
  code: string;
  language: string;
  onSave?: (code: string, language: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block">
      <div className="flex items-center gap-3">
        {language ? <span className="text-xs font-semibold text-mist">{language}</span> : null}
        <button
          type="button"
          className="text-link tap"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {onSave ? (
          <button type="button" className="text-link tap" onClick={() => onSave(code, language)}>
            Save
          </button>
        ) : null}
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
