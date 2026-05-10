import React from "react";

/** Tiny, safe markdown renderer for guidelines (headings, bold, italic, lists, blockquote, code). */
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineFormat(s: string): string {
  let out = escapeHtml(s);
  // bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic *text* (not part of **)
  out = out.replace(/(^|\W)\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // underline __text__
  out = out.replace(/__([^_]+)__/g, "<u>$1</u>");
  // inline code `code`
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs">$1</code>');
  return out;
}

export function SimpleMarkdown({ source, className = "" }: { source: string; className?: string }) {
  if (!source || !source.trim()) {
    return <p className="text-sm text-muted-foreground italic">No guidelines yet.</p>;
  }
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const Tag = `h${Math.min(level, 4)}` as keyof JSX.IntrinsicElements;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base"];
      blocks.push(
        <Tag
          key={key++}
          className={`font-bold ${sizes[Math.min(level - 1, 3)]} mt-4 mb-2 text-foreground`}
          dangerouslySetInnerHTML={{ __html: inlineFormat(h[2]) }}
        />,
      );
      i++;
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-4 border-primary/60 bg-primary/5 pl-3 py-2 my-2 text-sm italic text-foreground"
          dangerouslySetInnerHTML={{ __html: inlineFormat(buf.join(" ")) }}
        />,
      );
      continue;
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-6 space-y-1 my-2 text-sm">
          {items.map((it, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: inlineFormat(it) }} />
          ))}
        </ul>,
      );
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-6 space-y-1 my-2 text-sm">
          {items.map((it, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: inlineFormat(it) }} />
          ))}
        </ol>,
      );
      continue;
    }
    // Blank
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Paragraph (collect contiguous non-empty, non-special lines)
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p
        key={key++}
        className="text-sm leading-relaxed my-2 text-foreground"
        dangerouslySetInnerHTML={{ __html: inlineFormat(para.join(" ")) }}
      />,
    );
  }
  return <div className={className}>{blocks}</div>;
}
