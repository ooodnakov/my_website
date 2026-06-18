import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Language, homeContent } from "@/data/home";
import { Header, Footer } from "@/components/home";
import { XTermTerminal, type XTermTerminalHandle } from "@/components/home/XTermTerminal";

interface HomeProps {
  lang: Language;
}

export default function Home({ lang }: HomeProps) {
  const { toast } = useToast();
  const page = homeContent[lang];
  const nextLang = lang === "en" ? "ru" : "en";
  const quickLinks = page.sections.find((section) => section.type === "quickLinks")?.data as
    | { name: string; url: string; external?: boolean }[]
    | undefined;
  const shortcutLabel = lang === "ru" ? "ссылки" : "shortcuts";
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const terminalRef = useRef<XTermTerminalHandle>(null);
  const paletteCopy = lang === "ru"
    ? { button: "[палитра]", title: "Командная палитра", hint: "Быстрые команды и ссылки", close: "Закрыть", busy: "Терминал занят. Пожалуйста, подождите." }
    : { button: "[palette]", title: "Command palette", hint: "Fast commands and links", close: "Close", busy: "Terminal is busy. Please wait." };
  const paletteCommands = useMemo(() => ["tour", "plugins", "links", "open cv.txt", "projects", "contact", "github"], []);

  useEffect(() => {
    if (!isPaletteOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPaletteOpen]);

  const runPaletteCommand = (command: string) => {
    if (terminalRef.current?.runCommand(command)) {
      setPaletteOpen(false);
    } else {
      toast({ duration: 2000, variant: "destructive", title: paletteCopy.busy });
    }
  };

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
              zsh · user@main:~
            </div>
            <div className="w-16"></div> {/* Spacer for centering */}
          </div>

          {/* Actual XTerm */}
          <XTermTerminal ref={terminalRef} lang={lang} />

          <div className="border-t border-[#504945] bg-[#1d2021] px-4 py-3 text-xs text-[#a89984]">
            <span className="mr-3 text-[#fabd2f]">{shortcutLabel}</span>
            <button
              type="button"
              aria-label="Open command palette"
              onClick={() => setPaletteOpen(true)}
              className="mr-3 text-[#b8bb26] transition-colors hover:text-[#ebdbb2] hover:underline"
            >
              {paletteCopy.button}
            </button>
            {quickLinks?.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noreferrer" : undefined}
                className="mr-3 text-[#83a598] transition-colors hover:text-[#ebdbb2] hover:underline"
              >
                [{link.name}]
              </a>
            ))}
          </div>

          {isPaletteOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={paletteCopy.title}
              className="border-t border-[#504945] bg-[#282828] p-4 text-xs text-[#ebdbb2]"
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[#fabd2f]">{paletteCopy.title}</div>
                  <div className="text-[#928374]">{paletteCopy.hint}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaletteOpen(false)}
                  className="text-[#83a598] transition-colors hover:text-[#ebdbb2] hover:underline"
                >
                  [{paletteCopy.close}]
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {paletteCommands.map((command) => (
                  <button
                    key={command}
                    type="button"
                    onClick={() => runPaletteCommand(command)}
                    className="rounded border border-[#504945] bg-[#1d2021] px-3 py-2 text-left text-[#b8bb26] transition-colors hover:border-[#b8bb26] hover:text-[#ebdbb2] focus:outline-none focus:ring-2 focus:ring-[#b8bb26]"
                    aria-label={lang === "ru" ? `Запустить ${command} в терминале` : `Run ${command} in terminal`}
                  >
                    <code>{command}</code>
                  </button>
                ))}
                {quickLinks?.map((link) => (
                  <a
                    key={`palette-${link.name}`}
                    href={link.url}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                    className="rounded border border-[#504945] bg-[#1d2021] px-3 py-2 text-[#83a598] hover:text-[#ebdbb2] hover:underline"
                  >
                    {link.name}: {link.url}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

        </div>

      </main>

      <div className="mt-auto">
          <Footer />
      </div>
    </div>
  );
}
