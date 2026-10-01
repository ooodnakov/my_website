import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { Language } from '@/data/home';
import { LegacyTerminalSession } from '@/lib/terminal/legacySession';
import { bindTerminalInput } from '@/lib/terminal/input';
import type { TerminalSession, VisitorCommand } from '@/lib/terminal/session';
import { terminalTheme } from '@/lib/terminal/theme';
import { isSafeTerminalLink } from '@/lib/terminal/links';

interface XTermTerminalProps {
  lang: Language;
}

export interface XTermTerminalHandle {
  runCommand: (command: VisitorCommand) => boolean;
}

export const XTermTerminal = forwardRef<XTermTerminalHandle, XTermTerminalProps>(function XTermTerminal({ lang }, ref) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const [startupFailed, setStartupFailed] = useState(false);
  useImperativeHandle(ref, () => ({
    runCommand: (command: VisitorCommand) => sessionRef.current?.runVisitorCommand(command) ?? false,
  }), []);

  useEffect(() => {
    if (!terminalRef.current) return;

    const openSafeLink = (uri: string) => {
      if (!isSafeTerminalLink(uri, window.location.href)) return;
      window.open(uri, '_blank', 'noopener,noreferrer');
    };

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      fontFamily: '"Meslo Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: window.matchMedia('(max-width: 640px)').matches ? 12 : 14,
      lineHeight: 1.25,
      letterSpacing: 0.2,
      scrollback: 2000,
      smoothScrollDuration: 100,
      theme: terminalTheme,
      convertEol: true,
      linkHandler: {
        // Xterm otherwise discards relative and mailto OSC-8 links before activation.
        // Every URI still passes through the application's allowlist above.
        allowNonHttpProtocols: true,
        activate: (_event, uri) => openSafeLink(uri),
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon((_event, uri) => openSafeLink(uri));
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    termInstanceRef.current = term;

    let disposed = false;
    const session = new LegacyTerminalSession({ terminal: term, language: lang });
    sessionRef.current = session;
    const unsubscribeOutput = session.subscribeOutput((output) => {
      if (typeof output === "string" || output instanceof Uint8Array) term.write(output);
      else term.clear();
    });
    const inputBinding = bindTerminalInput(term, session.input);
    void session.start().catch(() => {
      if (!disposed && sessionRef.current === session && session.getState().status === 'failed') setStartupFailed(true);
    });

    let resizeFrame = 0;
    const handleResize = () => {
      if (disposed) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!disposed && terminalRef.current?.isConnected) {
          fitAddon.fit();
          session.resize(term.cols, term.rows);
        }
      });
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      unsubscribeOutput();
      inputBinding?.dispose();
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
      term.dispose();
      termInstanceRef.current = null;
    };
  }, []); // Run once on mount

  // Update language if it changes
  useEffect(() => {
    sessionRef.current?.setLanguage(lang);
  }, [lang]);

  const runMobileCommand = (command: VisitorCommand) => sessionRef.current?.runVisitorCommand(command, { focus: false });
  const focusTerminal = () => {
    termInstanceRef.current?.focus();
    terminalRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className="terminal-workspace bg-[#282828]">
      <div
        className="terminal-surface"
        onClick={focusTerminal}
        role="application"
        aria-label={lang === 'ru' ? 'Интерактивный терминал' : 'Interactive terminal'}
      >
        <div ref={terminalRef} className="h-full w-full" />
      </div>
      <div className="terminal-mobile-bar" aria-label={lang === 'ru' ? 'Быстрые команды терминала' : 'Terminal quick commands'}>
        {(['a', 'ls', 'eza', 'links', 'clear'] as const satisfies readonly VisitorCommand[]).map((command) => (
          <button key={command} type="button" onClick={() => runMobileCommand(command)}>{command}</button>
        ))}
        <button type="button" className="terminal-keyboard-button" onClick={focusTerminal} aria-label={lang === 'ru' ? 'Открыть клавиатуру' : 'Open keyboard'}>
          <span aria-hidden="true">⌨</span> {lang === 'ru' ? 'ввод' : 'type'}
        </button>
      </div>
      {startupFailed && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {lang === 'ru' ? 'Не удалось запустить терминал.' : 'The terminal could not start.'}
        </p>
      )}
    </div>
  );
});
