import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { Language } from '@/data/home';
import { LegacyTerminalSession } from '@/lib/terminal/legacySession';
import { V86TerminalSession } from '@/lib/terminal/v86Session';
import { bindTerminalInput } from '@/lib/terminal/input';
import type { PortfolioLinkId } from '@/lib/terminal/com2Protocol';
import type { TerminalSession, TerminalSessionState, VisitorCommand } from '@/lib/terminal/session';
import { terminalTheme } from '@/lib/terminal/theme';
import { isSafeTerminalLink } from '@/lib/terminal/links';

interface XTermTerminalProps {
  lang: Language;
}

export interface XTermTerminalHandle {
  runCommand: (command: VisitorCommand) => boolean;
}

type PendingPortfolioAction = {
  sessionToken: object;
  requestId: number;
  label: string;
} & ({ action: "open"; href: string } | { action: "copyContact" });
const PORTFOLIO_TARGETS: Record<PortfolioLinkId, (language: Language) => string> = {
  "quick-cv": (language) => `/cv/${language}`,
  "quick-pdf-en": () => "/cv-pdf/en",
  "quick-pdf-ru": () => "/cv-pdf/ru",
  "quick-archive": () => "/legacy/",
  "quick-vcard": () => "/vcard/828869858",
  "quick-mail": () => "mailto:ooodnakov@yandex.ru",
  "social-discord": () => "https://discord.com/users/ooodnakov",
  "social-reddit": () => "https://www.reddit.com/user/ooodnakov/",
  "social-x": () => "https://x.com/ooodnakov",
  "social-twitch": () => "https://twitch.tv/ooodnakov",
  "social-yt": () => "https://youtube.com/TheCoolkaOS1",
  "social-ig": () => "https://www.instagram.com/ooodnakov",
  "social-tg": () => "https://t.me/ooodnakov",
  "social-mastodon": () => "https://mastodon.social/@ooodnakov",
  "social-li": () => "https://www.linkedin.com/in/ooodnakov/",
  "social-gh": () => "https://github.com/ooodnakov",
  "social-tt": () => "https://www.tiktok.com/@ooodnakov",
  "project-cover-doc": () => "https://youtu.be/ILp3FTKG9Zg",
  "project-myspace-exp": () => "https://myspace.windows93.net/index.php?id=216",
  "project-lemma": () => "https://www.geogebra.org/geometry/srsyvgca",
  "project-articles": () => "https://vk.com/wall-168427103_141",
  "archive-projects": () => "/legacy/archive/projects/",
  "archive-events": () => "/legacy/archive/events/",
  "archive-gallery": () => "/legacy/archive/gallery/",
  "archive-video": () => "/legacy/archive/video/",
};

export const XTermTerminal = forwardRef<XTermTerminalHandle, XTermTerminalProps>(function XTermTerminal({ lang }, ref) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const languageRef = useRef(lang);
  const pendingPortfolioActionRef = useRef<PendingPortfolioAction | null>(null);
  const activeSessionTokenRef = useRef<object | null>(null);
  const [startupFailed, setStartupFailed] = useState(false);
  const [osMode, setOsMode] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [sessionState, setSessionState] = useState<TerminalSessionState>({ status: 'idle' });
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [pendingPortfolioAction, setPendingPortfolioAction] = useState<PendingPortfolioAction | null>(null);
  const [runtimeWarning, setRuntimeWarning] = useState<string | null>(null);
  const [controlFailure, setControlFailure] = useState<string | null>(null);
  const [nativeActionStatus, setNativeActionStatus] = useState<string | null>(null);

  const clearPendingPortfolioAction = () => {
    pendingPortfolioActionRef.current = null;
    setPendingPortfolioAction(null);
  };
  const reportNativeActionStatus = (sessionToken: object, english: string, russian: string) => {
    if (activeSessionTokenRef.current === sessionToken) setNativeActionStatus(languageRef.current === "ru" ? russian : english);
  };
  const openSafeLink = (uri: string): boolean => {
    if (!isSafeTerminalLink(uri, window.location.href)) return false;
    window.open(uri, "_blank", "noopener,noreferrer");
    return true;
  };
  const copyPrimaryContact = (sessionToken: object): boolean => {
    if (activeSessionTokenRef.current !== sessionToken) return false;
    try {
      const clipboard = navigator.clipboard?.writeText("ooodnakov@yandex.ru");
      if (!clipboard) {
        reportNativeActionStatus(sessionToken, "Clipboard access is unavailable.", "Буфер обмена недоступен.");
        return false;
      }
      void clipboard.then(
        () => reportNativeActionStatus(sessionToken, "Contact copied.", "Контакт скопирован."),
        () => reportNativeActionStatus(sessionToken, "Clipboard copy failed.", "Не удалось скопировать контакт."),
      );
      return true;
    } catch {
      reportNativeActionStatus(sessionToken, "Clipboard copy failed.", "Не удалось скопировать контакт.");
      return false;
    }
  };
  useImperativeHandle(ref, () => ({
    runCommand: (command: VisitorCommand) => sessionRef.current?.runVisitorCommand(command) ?? false,
  }), []);

  useEffect(() => {
    if (!terminalRef.current) return;


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
      convertEol: !osMode,
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
    const sessionToken = {};
    setNativeActionStatus(null);
    setRuntimeWarning(null);
    setControlFailure(null);
    const session = osMode
      ? new V86TerminalSession({
          columns: term.cols,
          rows: term.rows,
          language: lang,
          onStateChange: (state) => {
            setSessionState(state);
            if (state.status === 'failed') setStartupFailed(true);
            if ((state.status === "failed" || state.status === "disposed")
              && activeSessionTokenRef.current === sessionToken) {
              activeSessionTokenRef.current = null;
              clearPendingPortfolioAction();
            }
          },
          onProgress: (loaded, total) => setDownloadProgress({ loaded, total }),
          onRuntimeWarning: setRuntimeWarning,
          onOpenCv: () => {
            if (activeSessionTokenRef.current !== sessionToken) return false;
            const opened = openSafeLink(`/cv/${languageRef.current}`);
            reportNativeActionStatus(
              sessionToken,
              opened ? "Open request sent; browser popup settings may block it." : "The link was rejected.",
              opened ? "Запрос на открытие отправлен; браузер может заблокировать окно." : "Ссылка отклонена.",
            );
            return opened;
          },
          onCopyContact: () => copyPrimaryContact(sessionToken),
          onControlRevoked: (message) => {
            if (activeSessionTokenRef.current !== sessionToken) return;
            clearPendingPortfolioAction();
            setControlFailure(message);
          },
          onPortfolioActionRequest: (action, linkId, requestId) => {
            if (activeSessionTokenRef.current !== sessionToken || pendingPortfolioActionRef.current) return false;
            if (action === "open") {
              if (!Object.prototype.hasOwnProperty.call(PORTFOLIO_TARGETS, linkId)) return false;
              const href = PORTFOLIO_TARGETS[linkId](languageRef.current);
              if (!isSafeTerminalLink(href, window.location.href)) return false;
              const pending = { action: "open" as const, href, label: linkId, requestId, sessionToken };
              pendingPortfolioActionRef.current = pending;
              setPendingPortfolioAction(pending);
              return true;
            }
            if (action !== "copyContact" || linkId !== "quick-mail") return false;
            const pending = { action: "copyContact" as const, label: linkId, requestId, sessionToken };
            pendingPortfolioActionRef.current = pending;
            setPendingPortfolioAction(pending);
            return true;
          },
        })
      : new LegacyTerminalSession({ terminal: term, language: lang, onStateChange: setSessionState });
    sessionRef.current = session;
    activeSessionTokenRef.current = osMode ? sessionToken : null;
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
      if (activeSessionTokenRef.current === sessionToken) activeSessionTokenRef.current = null;
      pendingPortfolioActionRef.current = null;
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
      term.dispose();
      termInstanceRef.current = null;
    };
  }, [osMode, resetCount]);

  useEffect(() => {
    languageRef.current = lang;
    sessionRef.current?.setLanguage(lang);
  }, [lang]);

  const runMobileCommand = (command: VisitorCommand) => sessionRef.current?.runVisitorCommand(command, { focus: false });
  const focusTerminal = () => {
    termInstanceRef.current?.focus();
    terminalRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const resetGuest = () => {
    const session = sessionRef.current;
    if (!(session instanceof V86TerminalSession)) return;
    activeSessionTokenRef.current = null;
    clearPendingPortfolioAction();
    setNativeActionStatus(null);
    setRuntimeWarning(null);
    session.dispose();
    void session.whenDisposed().then(() => setResetCount((count) => count + 1));
  };
  const stopGuest = () => {
    activeSessionTokenRef.current = null;
    clearPendingPortfolioAction();
    setNativeActionStatus(null);
    setRuntimeWarning(null);
    setOsMode(false);
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
          <button
            key={command}
            type="button"
            disabled={osMode}
            onClick={() => runMobileCommand(command)}
          >{command}</button>
        ))}
        <button type="button" className="terminal-keyboard-button" onClick={focusTerminal} aria-label={lang === 'ru' ? 'Открыть клавиатуру' : 'Open keyboard'}>
          <span aria-hidden="true">⌨</span> {lang === 'ru' ? 'ввод' : 'type'}
        </button>
      </div>
      {pendingPortfolioAction && (
        <div className="terminal-guest-action" role="status" aria-live="polite">
          <span>
            {pendingPortfolioAction.action === "open"
              ? (lang === "ru" ? `Гость просит открыть: ${pendingPortfolioAction.label}` : `Guest requests opening: ${pendingPortfolioAction.label}`)
              : (lang === "ru" ? "Гость просит скопировать контакт" : "Guest requests copying the contact")}
          </span>
          <button type="button" onClick={() => {
            const pending = pendingPortfolioActionRef.current;
            if (!pending) return;
            clearPendingPortfolioAction();
            if (pending.sessionToken !== activeSessionTokenRef.current) return;
            if (sessionState.status !== "ready") {
              reportNativeActionStatus(
                pending.sessionToken,
                "The guest session is no longer ready.",
                "Гостевая сессия больше не готова.",
              );
              return;
            }
            if (pending.action === "open") {
              const opened = openSafeLink(pending.href);
              reportNativeActionStatus(
                pending.sessionToken,
                opened ? "Open request sent; browser popup settings may block it." : "The link was rejected.",
                opened ? "Запрос на открытие отправлен; браузер может заблокировать окно." : "Ссылка отклонена.",
              );
            } else {
              copyPrimaryContact(pending.sessionToken);
            }
          }}>
            {lang === "ru" ? "Разрешить" : "Allow"}
          </button>
          <button type="button" onClick={clearPendingPortfolioAction}>
            {lang === "ru" ? "Отклонить" : "Deny"}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm text-white/80" aria-live="polite">
        {osMode ? (
          <>
            <span>
              {sessionState.status === 'ready'
                ? (lang === 'ru'
                  ? 'Гостевая оболочка готова · ввод активен; быстрые команды отключены до безопасной синхронизации ввода'
                  : 'Guest shell ready · typing stays active; quick commands wait for a safe input fence')
                : sessionState.status === 'failed'
                  ? (lang === 'ru' ? 'Не удалось запустить ОС' : 'OS preview failed')
                  : (lang === 'ru' ? 'Загрузка и запуск гостевой ОС…' : 'Loading and booting guest OS…')}
            </span>
            {downloadProgress && downloadProgress.total > 0 && sessionState.status === 'busy' && (
              <progress max={downloadProgress.total} value={downloadProgress.loaded} className="w-32" />
            )}
            {sessionState.status === 'failed' && (
              <span role="alert">{sessionState.error?.message}</span>
            )}
            {controlFailure && (
              <span role="alert">
                {lang === "ru"
                  ? "Канал управления гостем отключён; ожидающие действия отменены. Ввод и Ctrl+C остаются доступны."
                  : "Guest control channel revoked; pending actions were canceled. Raw input and Ctrl+C remain available."}
                {" "}{controlFailure}
              </span>
            )}
            <button type="button" onClick={resetGuest} disabled={sessionState.status === 'disposed'}>
              {lang === 'ru' ? 'Перезапустить' : 'Reset'}
            </button>
            <button type="button" onClick={stopGuest}>
              {lang === 'ru' ? 'Остановить · лёгкий режим' : 'Stop · lightweight mode'}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOsMode(true)}>
            {lang === 'ru' ? 'Запустить гостевую ОС' : 'Start opt-in OS preview'}
          </button>
        )}
      </div>
      {!osMode && startupFailed && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {lang === 'ru' ? 'Не удалось запустить терминал.' : 'The terminal could not start.'}
        </p>
      )}
    </div>
  );
});
