import React from "react";
import { cn } from "@/lib/utils";

// A small, safe Markdown renderer for row pages. It builds React elements
// (no innerHTML) and supports headings, paragraphs, bold, italic, strike,
// inline code, code blocks, links, bullet/numbered/task lists, quotes and rules.

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/|mailto:)[^)\s]+\))|(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{inline(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<s key={key}>{inline(token.slice(2, -2), key)}</s>);
    else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]("));
      const href = token.slice(token.indexOf("](") + 2, -1);
      nodes.push(<a key={key} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{label}</a>);
    } else if (token.startsWith("http")) nodes.push(<a key={key} href={token} target="_blank" rel="noreferrer" className="underline underline-offset-2">{token}</a>);
    else nodes.push(<em key={key}>{inline(token.slice(1, -1), key)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const key = `b${index}`;
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push(<pre key={key} className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const size = heading[1].length === 1 ? "text-xl" : heading[1].length === 2 ? "text-lg" : "text-base";
      blocks.push(<p key={key} role="heading" aria-level={heading[1].length + 1} className={cn("mt-2 font-semibold", size)}>{inline(heading[2], key)}</p>);
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-2" />);
      index += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key} className="border-l-2 pl-3 text-muted-foreground">{inline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[index])) {
        const content = lines[index].replace(/^\s*([-*+]|\d+[.)])\s+/, "");
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(content);
        items.push(
          <li key={`${key}-${index}`} className={task ? "flex list-none items-start gap-2" : undefined}>
            {task ? <input type="checkbox" checked={task[1] !== " "} readOnly className="mt-1" aria-label="Task" /> : null}
            <span>{inline(task ? task[2] : content, `${key}-${index}`)}</span>
          </li>,
        );
        index += 1;
      }
      blocks.push(ordered ? <ol key={key} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={key} className="list-disc space-y-1 pl-5">{items}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|```|>|\s*([-*+]|\d+[.)])\s)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={key}>{inline(paragraph.join(" "), key)}</p>);
  }
  return <div className={cn("grid gap-3 text-sm leading-relaxed", className)}>{blocks}</div>;
}

/** Page body editor: write Markdown, see it rendered when not editing. */
export function PageBody({ value, onChange, readOnly }: { value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const area = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!editing || !area.current) return;
    area.current.focus();
    area.current.style.height = "auto";
    area.current.style.height = `${Math.max(160, area.current.scrollHeight)}px`;
  }, [editing]);
  if (editing && !readOnly) {
    return (
      <textarea
        ref={area}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${Math.max(160, event.target.scrollHeight)}px`;
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), setEditing(false))}
        placeholder="Write notes in Markdown: # heading, **bold**, - list, - [ ] task, [link](https://…)"
        className="min-h-40 w-full resize-none rounded-md border bg-transparent p-3 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="Page content"
      />
    );
  }
  return (
    <div
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={() => !readOnly && setEditing(true)}
      onKeyDown={(event) => !readOnly && event.key === "Enter" && (event.preventDefault(), setEditing(true))}
      className={cn("min-h-24 rounded-md p-3", !readOnly && "cursor-text hover:bg-accent/50")}
      aria-label={readOnly ? undefined : "Edit page content"}
    >
      {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-muted-foreground">{readOnly ? "No content." : "Add notes, meeting minutes or a description…"}</p>}
    </div>
  );
}
