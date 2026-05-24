import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Language, homeContent } from "@/data/home";
import { Header, Hero, Footer, SectionRenderer } from "@/components/home";
import { FullPrompt } from "@/components/ui/Prompt";

interface HomeProps {
  lang: Language;
}

export default function Home({ lang }: HomeProps) {
  const { toast } = useToast();
  const page = homeContent[lang];
  const nextLang = lang === "en" ? "ru" : "en";

  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const totalSteps = page.sections.length + 1; // 1 for Hero, plus sections

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ duration: 2000, className: "bg-[#282828] border-[#928374] text-[#ebdbb2]", title: page.copySuccess });
    } catch {
      toast({ duration: 2000, variant: "destructive", title: page.copyError });
    }
  };

  const getCommandForStep = (idx: number) => {
    if (idx === 0) return page.hero.title.replace("❯ ", "");
    const section = page.sections[idx - 1];
    if (section.title) return section.title.replace("❯ ", "");
    if (section.type === "social") return "sf ~/.config/social.toml";
    if (section.type === "quickLinks") return "sf quicklinks.toml";
    return "echo 'hello'";
  };

  const handleClick = () => {
    if (step >= totalSteps || isTyping) return;
    setIsTyping(true);
  };

  const handleTypingComplete = () => {
    setIsTyping(false);
    setStep(s => s + 1);
  };

  return (
    <div
      className="min-h-screen bg-[#282828] px-4 py-6 sm:px-8 sm:py-8 font-mono text-sm"
      onClick={handleClick}
    >
      <Header lang={lang} nextLang={nextLang} copyPageLink={copyPageLink} />

      <main className="mx-auto max-w-3xl cursor-default">
        {step > 0 && (
          <Hero title={page.hero.title} desc={page.hero.desc} />
        )}

        {page.sections.slice(0, step > 0 ? step - 1 : 0).map((section, index) => (
          <SectionRenderer key={index} section={section} />
        ))}

        {step < totalSteps && (
          <FullPrompt
            command={getCommandForStep(step)}
            isTyping={isTyping}
            onTypingComplete={handleTypingComplete}
          />
        )}

        {step >= totalSteps && (
          <>
            <FullPrompt />
            <div className="mt-8">
              <Footer />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
