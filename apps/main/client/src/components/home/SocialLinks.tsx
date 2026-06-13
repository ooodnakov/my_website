import { TransientPrompt } from "../ui/Prompt";
import { SocialLink } from "@/data/home";
import { EzaRow } from "./EzaRow";

interface SocialLinksProps {
  links: SocialLink[];
  prompt?: string;
  className?: string;
  timestamp?: string;
}

export function SocialLinks({ links, prompt = "❯ eza -la --icons --color=always socials/", className = "", timestamp }: SocialLinksProps) {
  // Generate some realistic-looking file metadata for socials
  const today = new Date();
  const day = today.getDate().toString().padStart(2, '0');
  const month = today.toLocaleString('en-US', { month: 'short' });
  const year = today.getFullYear();

  return (
    <section className={`mb-4 border-b border-[#928374]/30 pb-4 ${className}`}>
      <TransientPrompt command={prompt.replace("❯ ", "")} timestamp={timestamp} />
      <div className="font-mono text-sm overflow-x-auto mt-2 p-3 bg-transparent">
        <div className="flex flex-col min-w-max">
          {links.map((link, i) => {
            // Fake varying sizes
            const sizeStr = `${(1.2 + i * 0.3).toFixed(1)}k`;
            const dateStr = `${day} ${month}  ${year}`;

            return (
              <EzaRow
                key={link.name}
                permissions="lrwxrwxrwx"
                size="-"
                user="rem"
                date={dateStr}
                icon={link.icon}
                name={`${link.name.toLowerCase()}.url`}
                target={link.url}
                url={link.url}
                external={true}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
