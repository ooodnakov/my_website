import { Link } from "react-router-dom";
import type { Language } from "@/content";

interface LanguageSwitcherProps {
  lang: Language;
}

const LanguageSwitcher = ({ lang }: LanguageSwitcherProps) => {
  return (
    <div className="fixed top-6 left-6 z-50 flex items-center gap-2 rounded-full border border-border bg-secondary/80 px-2 py-2 backdrop-blur-sm">
      <Link
        to="/en"
        className={`rounded-full px-3 py-1 text-xs font-semibold tracking-[0.2em] transition-colors ${
          lang === "en" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-primary"
        }`}
      >
        EN
      </Link>
      <Link
        to="/ru"
        className={`rounded-full px-3 py-1 text-xs font-semibold tracking-[0.2em] transition-colors ${
          lang === "ru" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-primary"
        }`}
      >
        RU
      </Link>
    </div>
  );
};

export default LanguageSwitcher;
