import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { VirtualFileSystem } from '@/lib/vfs';
import { Shell } from '@/lib/shell';
import { Language } from '@/data/home';

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
      theme: {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#ebdbb2',
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984',
        brightBlack: '#928374',
        brightRed: '#fb4934',
        brightGreen: '#b8bb26',
        brightYellow: '#fabd2f',
        brightBlue: '#83a598',
        brightMagenta: '#d3869b',
        brightCyan: '#8ec07c',
        brightWhite: '#ebdbb2',
      },
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
      className="w-full h-[600px] overflow-hidden bg-[#282828]"
      style={{ padding: '12px' }}
    >
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}
