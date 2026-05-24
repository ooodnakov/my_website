import { QuickLink } from "@/data/home";

interface QuickLinksProps {
  links: QuickLink[];
  prompt?: string;
  className?: string;
}

export function QuickLinks({ links, prompt = "❯ sf quicklinks.toml", className = "" }: QuickLinksProps) {
  return (
    <section className={`mb-4 border-b border-[#928374]/30 pb-4 ${className}`}>
      <p className="text-[#b8bb26] text-sm mb-1 break-all">{prompt}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
            className="inline-flex items-center gap-1 rounded bg-[#3c3836] px-3 py-1 text-[#ebdbb2] hover:bg-[#fe8019] hover:text-[#282828] text-sm"
            title={link.title}
          >
            <span className="text-[#fe8019]">{link.icon}</span>
            {link.name}
          </a>
        ))}
      </div>
    </section>
  );
}