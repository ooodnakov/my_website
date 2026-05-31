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
  const mainRef = useRef<HTMLElement>(null);

  // Auto-advance logic
  useEffect(() => {
    if (!isTyping && step < totalSteps) {
      // Start typing next command automatically after a short delay
      const timer = setTimeout(() => {
        setIsTyping(true);
      }, 500); // Wait 500ms before starting to type next command
      return () => clearTimeout(timer);
    }
  }, [step, isTyping, totalSteps]);

  // Auto scroll to bottom
  useEffect(() => {
    if (mainRef.current) {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth"
        });
    }
  }, [step, isTyping]);


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
    if (section.type === "social") return "eza -la --icons --color=always socials/";
    if (section.type === "quickLinks") return "eza -la --icons --color=always quicklinks/";
    return "echo 'hello'";
  };

  const handleClick = () => {
    // Allow skipping the entire animation by clicking
    if (step < totalSteps) {
      setStep(totalSteps);
      setIsTyping(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#282828] px-4 py-6 sm:px-8 sm:py-8 font-mono text-sm selection:bg-[#fe8019] selection:text-[#282828]"
      onClick={handleClick}
    >
      <Header lang={lang} nextLang={nextLang} copyPageLink={copyPageLink} />

      <main ref={mainRef} className="mx-auto max-w-[54rem] cursor-default pb-12">
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
            onTypingComplete={() => {
                setIsTyping(false);
                setStep(s => s + 1);
            }}
          />
        )}

        {step >= totalSteps && (
          <>
            <FullPrompt />
            <div className="mt-8 animate-in fade-in duration-500">
              <Footer />
            </div>
          </>
        )}
      </main>

      {step < totalSteps && (
        <div className="fixed bottom-4 right-4 text-[#928374] text-xs opacity-50 animate-pulse">
            Click anywhere to skip animation...
        </div>
      )}
    </div>
  );
}
