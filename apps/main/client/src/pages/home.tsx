import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Language, homeContent, PageSection } from "@/data/home";
import { Header, Hero, Footer, SectionRenderer } from "@/components/home";
import { InteractivePrompt, TransientPrompt } from "@/components/ui/Prompt";

interface HomeProps {
  lang: Language;
}

interface CommandHistoryEntry {
  command: string;
  output: React.ReactNode;
}

export default function Home({ lang }: HomeProps) {
  const { toast } = useToast();
  const page = homeContent[lang];
  const nextLang = lang === "en" ? "ru" : "en";

  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const mainRef = useRef<HTMLElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (mainRef.current) {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth"
        });
    }
  }, [history]);

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ duration: 2000, className: "bg-[#282828] border-[#928374] text-[#ebdbb2]", title: page.copySuccess });
    } catch {
      toast({ duration: 2000, variant: "destructive", title: page.copyError });
    }
  };

  const getSectionByCommand = (cmd: string): PageSection | undefined => {
    if (cmd === "eza -la --icons --color=always socials/") return page.sections.find(s => s.type === "social");
    if (cmd === "eza -la --icons --color=always quicklinks/") return page.sections.find(s => s.type === "quickLinks");
    return page.sections.find(s => s.title?.replace("❯ ", "") === cmd);
  };

  const availableCommands = [
    "eza -la --icons --color=always socials/",
    "eza -la --icons --color=always quicklinks/",
    ...page.sections.map(s => s.title?.replace("❯ ", "")).filter(Boolean) as string[],
    "help",
    "clear",
    "sudo",
    "ls",
    "cat"
  ];

  const handleCommand = (cmd: string) => {
    setCommandHistory(prev => [...prev, cmd]);

    let output: React.ReactNode = null;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    if (cmd === "clear") {
      setHistory([]);
      return;
    } else if (cmd === "help") {
      output = (
        <div className="mb-4">
          <TransientPrompt command={cmd} timestamp={timestamp} />
          <div className="font-mono text-sm overflow-x-auto mt-2 p-3 bg-transparent text-[#ebdbb2]">
            <p>Available commands:</p>
            <ul className="list-disc list-inside mt-2 ml-2">
              {availableCommands.filter(c => c !== "help" && c !== "clear" && c !== "sudo" && c !== "ls" && c !== "cat").map((c, i) => (
                <li key={i} className="mb-1">{c}</li>
              ))}
              <li className="mb-1">clear</li>
              <li className="mb-1">help</li>
            </ul>
          </div>
        </div>
      );
    } else if (cmd === "sudo" || cmd.startsWith("sudo ")) {
        output = (
            <div className="mb-4">
                <TransientPrompt command={cmd} timestamp={timestamp} />
                <div className="font-mono text-sm mt-2 p-3 text-[#fb4934]">
                    user is not in the sudoers file. This incident will be reported.
                </div>
            </div>
        )
    } else if (cmd === "ls" || cmd === "eza") {
         output = (
            <div className="mb-4">
                <TransientPrompt command={cmd} timestamp={timestamp} />
                <div className="font-mono text-sm mt-2 p-3 text-[#83a598] flex gap-4">
                    <span>index.txt</span>
                    <span>README.md</span>
                    <span className="text-[#d79921]">socials/</span>
                    <span className="text-[#d79921]">quicklinks/</span>
                    <span className="text-[#d79921]">projects/</span>
                    <span>cv.txt</span>
                    <span className="text-[#d79921]">archive/</span>
                </div>
            </div>
        )
    } else if (cmd.startsWith("cat ")) {
         output = (
            <div className="mb-4">
                <TransientPrompt command={cmd} timestamp={timestamp} />
                <div className="font-mono text-sm mt-2 p-3 text-[#ebdbb2]">
                    cat: use bat instead for files like index.txt and README.md
                </div>
            </div>
        )
    } else {
      const section = getSectionByCommand(cmd);
      if (section) {
        output = <SectionRenderer section={section} timestamp={timestamp} />;
      } else {
        output = (
          <div className="mb-4">
            <TransientPrompt command={cmd} timestamp={timestamp} />
            <div className="font-mono text-sm mt-2 p-3 text-[#fb4934]">
              Command not found: {cmd}. Type 'help' for available commands.
            </div>
          </div>
        );
      }
    }

    setHistory(prev => [...prev, { command: cmd, output }]);
  };

  return (
    <div
      className="min-h-screen bg-[#282828] px-4 py-6 sm:px-8 sm:py-8 font-mono text-sm selection:bg-[#fe8019] selection:text-[#282828]"
    >
      <Header lang={lang} nextLang={nextLang} copyPageLink={copyPageLink} />

      <main ref={mainRef} className="mx-auto max-w-[54rem] cursor-default pb-12">
        <Hero title={page.hero.title} desc={page.hero.desc} />

        {history.map((entry, idx) => (
          <React.Fragment key={idx}>
            {entry.output}
          </React.Fragment>
        ))}

        <InteractivePrompt
          onCommand={handleCommand}
          history={commandHistory}
          suggestions={availableCommands}
        />

        <div className="mt-8">
            <Footer />
        </div>
      </main>
    </div>
  );
}
