import React from "react";
import { useToast } from "@/hooks/use-toast";
import { Language, homeContent } from "@/data/home";
import { Header, Footer } from "@/components/home";
import { XTermTerminal } from "@/components/home/XTermTerminal";

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
    <div
      className="min-h-screen bg-[#1d2021] px-4 py-6 sm:px-8 sm:py-8 font-mono text-sm selection:bg-[#fe8019] selection:text-[#282828] flex flex-col"
    >
      <Header lang={lang} nextLang={nextLang} copyPageLink={copyPageLink} />

      <main className="mx-auto w-full max-w-5xl flex-grow flex flex-col justify-center py-8">

        {/* Terminal Window Decoration */}
        <div className="w-full shadow-2xl rounded-lg overflow-hidden border border-[#504945] bg-[#282828]">

          {/* Mac-like Window Header */}
          <div className="bg-[#3c3836] px-4 py-2 flex items-center justify-between border-b border-[#504945]">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-[#cc241d]"></div>
              <div className="w-3 h-3 rounded-full bg-[#d79921]"></div>
              <div className="w-3 h-3 rounded-full bg-[#98971a]"></div>
            </div>
            <div className="text-[#a89984] text-xs font-semibold">
              user@main:~
            </div>
            <div className="w-16"></div> {/* Spacer for centering */}
          </div>

          {/* Actual XTerm */}
          <XTermTerminal lang={lang} />

        </div>

      </main>

      <div className="mt-auto">
          <Footer />
      </div>
    </div>
  );
}
