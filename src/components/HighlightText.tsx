import React from 'react';

interface HighlightTextProps {
  text: string;
  highlight: string;
  className?: string;
}

/**
 * Renders text with matching substrings highlighted in a bright background.
 * Case-insensitive. If no highlight term or no match, renders plain text.
 */
export const HighlightText: React.FC<HighlightTextProps> = ({ text, highlight, className }) => {
  if (!highlight || highlight.trim().length < 2 || !text) {
    return <span className={className}>{text}</span>;
  }

  const term = highlight.trim();
  // Escape regex special chars
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) {
    // No match found
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-300 dark:bg-yellow-500/70 text-foreground rounded-sm px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};
