import { TransientPrompt } from "../ui/Prompt";
import { QuickLink } from "@/data/home";
import { EzaRow } from "./EzaRow";

interface QuickLinksProps {
  links: QuickLink[];
  prompt?: string;
  className?: string;
}

export function QuickLinks({ links, prompt = "❯ eza -la --icons --color=always quicklinks/", className = "" }: QuickLinksProps) {
  // Generate some realistic-looking file metadata
  const today = new Date();
  const day = today.getDate().toString().padStart(2, '0');
  const month = today.toLocaleString('en-US', { month: 'short' });
  const year = today.getFullYear();

  return (
    <section className={`mb-4 border-b border-[#928374]/30 pb-4 ${className}`}>
      <TransientPrompt command={prompt.replace("❯ ", "")} />
      <div className="font-mono text-sm overflow-x-auto mt-2 p-3 bg-transparent">
         <div className="flex flex-col min-w-max">
          {links.map((link, i) => {
            const isDir = link.url.endsWith('/');
            const perms = isDir ? "drwxr-xr-x" : "-rw-r--r--";
            const sizeStr = isDir ? "-" : `${(4.5 + i * 1.1).toFixed(1)}k`;
            const dateStr = `${day} ${month}  ${year}`;

            return (
              <EzaRow
                key={link.name}
                permissions={perms}
                size={sizeStr}
                user="rem"
                date={dateStr}
                icon={link.icon}
                name={link.name}
                url={link.url}
                external={link.external}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
