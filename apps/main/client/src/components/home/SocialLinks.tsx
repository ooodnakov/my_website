import { TransientPrompt } from "../ui/Prompt";
import { SocialLink } from "@/data/home";

interface SocialLinksProps {
  links: SocialLink[];
  prompt?: string;
  className?: string;
}

export function SocialLinks({ links, prompt = "❯ sf ~/.config/social.toml", className = "" }: SocialLinksProps) {
  // Split evenly: first row gets ceil(n/2), second gets floor(n/2)
  const half = Math.ceil(links.length / 2);
  const row1 = links.slice(0, half);
  const row2 = links.slice(half);

  return (
    <section className={`mb-4 border-b border-[#928374]/30 pb-4 ${className}`}>
      <TransientPrompt command={prompt.replace("❯ ", "")} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {row1.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded bg-[#3c3836] px-3 py-1 text-[#ebdbb2] hover:bg-[#fe8019] hover:text-[#282828]"
            >
              <span className="text-[#83a598]">{link.icon}</span>
              {link.name}
            </a>
          ))}
        </div>
        {row2.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {row2.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded bg-[#3c3836] px-3 py-1 text-[#ebdbb2] hover:bg-[#fe8019] hover:text-[#282828]"
              >
                <span className="text-[#83a598]">{link.icon}</span>
                {link.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}