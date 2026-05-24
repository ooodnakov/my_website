import { useToast } from "@/hooks/use-toast";
import { Language, homeContent } from "@/data/home";
import {
  TerminalBlock,
  AboutLines,
  PreOutput,
  LinkOutput,
  CtaButton,
  SocialLinks,
  QuickLinks
} from "@/components/home";

interface HomeProps {
  lang: Language;
}

export default function Home({ lang }: HomeProps) {
  const { toast } = useToast();
  const page = homeContent[lang];
  const nextLang = lang === "en" ? "ru" : "en";

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ duration: 2000, className: "bg-[#282828] border-[#928374] text-[#ebdbb2]", title: page.copySuccess });
    } catch {
      toast({ duration: 2000, variant: "destructive", title: page.copyError });
    }
  };

  return (
    <div className="min-h-screen bg-[#282828] px-4 py-6 sm:px-8 sm:py-8 font-mono text-sm">
      <header className="mb-6 flex items-center justify-between">
        <div className="text-[#b8bb26]">❯ <span className="text-[#ebdbb2]">cd ~/sites/main</span></div>
        <div className="flex items-center gap-3">
          <a href={`/${nextLang}`} className="text-[#928374] hover:text-[#ebdbb2]">[{nextLang.toUpperCase()}]</a>
          <button onClick={copyPageLink} className="text-[#928374] hover:text-[#fe8019]">[copy]</button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        {/* Hero */}
        <section className="mb-6 border-b border-[#928374]/30 pb-6">
          <p className="text-[#b8bb26] text-sm">{page.hero.title}</p>
          <p className="mt-1 text-[#ebdbb2] text-sm">{page.hero.desc}</p>
        </section>

        <SocialLinks links={page.contact} prompt="❯ sf ~/.config/social.toml" className="text-sm" />
        <QuickLinks links={page.quickLinks} prompt="❯ sf quicklinks.toml" className="text-sm" />

        <TerminalBlock title="❯ bat README.md" className="text-sm">
          <AboutLines lines={page.about.lines} />
        </TerminalBlock>

        <TerminalBlock title={page.projects.title} className="text-sm">
          <div className="text-[#928374] underline mb-1 break-words">Permissions Size  User Date Modified  Name</div>
          <LinkOutput items={page.projects.items} textColor="text-[#a89984]" />
        </TerminalBlock>

        <TerminalBlock title={page.cv.title} className="text-sm">
          <PreOutput lines={page.cv.items} />
          <CtaButton label="open /cv/-" url={page.cv.ctaUrl} />
        </TerminalBlock>

        <TerminalBlock title={page.archive.title} className="text-sm">
          <LinkOutput items={page.archive.items} textColor="text-[#83a598]" />
        </TerminalBlock>

        <footer className="pt-4">
          <p className="text-[#928374]">
            ❯ <span className="text-[#b8bb26]">exit 0</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
