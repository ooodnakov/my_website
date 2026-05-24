import { Language } from "@/data/home";

interface HeaderProps {
  lang: Language;
  nextLang: "en" | "ru";
  copyPageLink: () => void;
}

export function Header({ lang, nextLang, copyPageLink }: HeaderProps) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <div className="text-[#b8bb26]">❯ <span className="text-[#ebdbb2]">cd ~/sites/main</span></div>
      <div className="flex items-center gap-3">
        <a href={`/${nextLang}`} className="text-[#928374] hover:text-[#ebdbb2]">[{nextLang.toUpperCase()}]</a>
        <button onClick={copyPageLink} className="text-[#928374] hover:text-[#fe8019]">[copy]</button>
      </div>
    </header>
  );
}
