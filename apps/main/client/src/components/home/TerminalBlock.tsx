import { TransientPrompt } from "../ui/Prompt";
import { ContentLine } from "@/data/home";

type LineType = "border" | "file" | "content" | "default";

interface TerminalBlockProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  timestamp?: string;
}

export function TerminalBlock({ title, children, className = "", timestamp }: TerminalBlockProps) {
  return (
    <section className={`mb-4 border-b border-[#928374]/30 pb-4 ${className}`}>
      {title && <TransientPrompt command={title.replace("❯ ", "")} timestamp={timestamp} />}
      {!title && <br/>}
      <div className="font-mono text-sm whitespace-pre overflow-x-auto mt-2 p-3 bg-transparent">
        {children}
      </div>
    </section>
  );
}

interface AboutLinesProps {
  lines: ContentLine[];
}

export function AboutLines({ lines }: AboutLinesProps) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className={`block ${getLineColor(l.type)}`}>{l.line}</span>
      ))}
    </>
  );
}

const getLineColor = (type: LineType): string => {
  switch (type) {
    case "border": return "text-[#928374]";
    case "file": return "text-[#83a598]";
    case "content": return "text-[#ebdbb2]";
    default: return "text-[#a89984]";
  }
};

interface PreOutputProps {
  lines: string[];
  textColor?: string;
}

export function PreOutput({ lines, textColor = "text-[#a89984]" }: PreOutputProps) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={`block ${textColor}`}>{line}</span>
      ))}
    </>
  );
}

interface LinkOutputProps {
  items: { name: string; url: string; external?: boolean }[];
  textColor?: string;
}

export function LinkOutput({ items, textColor = "text-[#83a598]" }: LinkOutputProps) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className={`block ${textColor}`}>
          <a 
            href={item.url}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className="hover:text-[#fe8019] hover:underline transition-colors"
          >
            {item.name}
          </a>
        </span>
      ))}
    </>
  );
}

interface CtaButtonProps {
  label: string;
  url: string;
}

export function CtaButton({ label, url }: CtaButtonProps) {
  return (
    <a
      href={url}
      className="mt-3 inline-flex items-center gap-1.5 rounded bg-[#fe8019] px-3 py-1 text-[#282828] hover:bg-[#fabd2f] text-sm font-semibold transition-colors duration-150 shadow-sm"
    >
      <span className="opacity-70">❯</span> {label}
    </a>
  );
}
