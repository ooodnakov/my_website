import { Language } from "@/data/home";

interface HeaderProps {
  lang: Language;
  nextLang: "en" | "ru";
  copyPageLink: () => void;
}

export function Header({ lang, nextLang, copyPageLink }: HeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 opacity-80">
      <div className="flex items-center text-sm">
        <span className="text-[#5fdf00] mr-2">❯</span>
        <span className="text-[#ebdbb2]">cd ~/src/main</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        <nav aria-label="Webring" className="flex items-center gap-3 text-sm">
          <a href="https://webring.otomir23.me/ooodnakov/prev" title="Previous in webring" rel="prev" className="text-[#83a598] hover:text-[#ebdbb2] hover:underline transition-colors">⟨ Prev</a>
          <a href="https://webring.otomir23.me" title="Webring home" rel="noopener" className="text-[#83a598] hover:text-[#ebdbb2] hover:underline transition-colors">[rutg webring]</a>
          <a href="https://webring.otomir23.me/ooodnakov/next" title="Next in webring" rel="next" className="text-[#83a598] hover:text-[#ebdbb2] hover:underline transition-colors">Next ⟩</a>
        </nav>
        <a href={`/${nextLang}`} className="text-[#83a598] hover:text-[#ebdbb2] hover:underline transition-colors">[{nextLang.toUpperCase()}]</a>
        <button onClick={copyPageLink} className="text-[#83a598] hover:text-[#fe8019] hover:underline transition-colors">[copy]</button>
      </div>
    </header>
  );
}
