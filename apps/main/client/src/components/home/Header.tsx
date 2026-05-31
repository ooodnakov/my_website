import { Language } from "@/data/home";

interface HeaderProps {
  lang: Language;
  nextLang: "en" | "ru";
  copyPageLink: () => void;
}

export function Header({ lang, nextLang, copyPageLink }: HeaderProps) {
  return (
    <header className="mb-6 flex items-center justify-between opacity-80">
      <div className="flex items-center text-sm">
        <span className="text-[#5fdf00] mr-2">❯</span>
        <span className="text-[#ebdbb2]">cd ~/src/main</span>
      </div>
      <div className="flex items-center gap-3">
        <a href={`/${nextLang}`} className="text-[#83a598] hover:text-[#ebdbb2] hover:underline transition-colors">[{nextLang.toUpperCase()}]</a>
        <button onClick={copyPageLink} className="text-[#83a598] hover:text-[#fe8019] hover:underline transition-colors">[copy]</button>
      </div>
    </header>
  );
}
