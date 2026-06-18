import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { VirtualFileSystem } from '@/lib/vfs';
import { Shell } from '@/lib/shell';
import { Language } from '@/data/home';
import { terminalTheme } from '@/lib/terminal/theme';

interface XTermTerminalProps {
  lang: Language;
}

export function XTermTerminal({ lang }: XTermTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<Shell | null>(null);
  const vfsRef = useRef<VirtualFileSystem | null>(null);
  const termInstanceRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize Terminal
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 14,
      theme: terminalTheme,

      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    termInstanceRef.current = term;

    // Initialize VFS and Shell
    const vfs = new VirtualFileSystem(lang);
    vfsRef.current = vfs;
    shellRef.current = new Shell(term, vfs);

    // Handle Resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      termInstanceRef.current = null;
    };
  }, []); // Run once on mount

  // Update language if it changes
  useEffect(() => {
    if (vfsRef.current && shellRef.current && vfsRef.current.lang !== lang) {
        vfsRef.current.setLang(lang);
        shellRef.current.updateVfs(vfsRef.current);
    }
  }, [lang]);

  return (
    <div
      className="w-full h-[min(70vh,720px)] min-h-[360px] overflow-hidden bg-[#282828]"
      style={{ padding: '12px' }}
      onClick={() => termInstanceRef.current?.focus()}
    >
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}
