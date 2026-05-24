import React, { useState, useEffect } from "react";

export function FullPrompt({ command, isTyping, onTypingComplete }: { command?: string, isTyping?: boolean, onTypingComplete?: () => void }) {
  const [typedCommand, setTypedCommand] = useState("");

  useEffect(() => {
    if (isTyping && command) {
      let current = "";
      let i = 0;
      setTypedCommand(""); // Start empty when typing begins
      const interval = setInterval(() => {
        current += command[i];
        setTypedCommand(current);
        i++;
        if (i >= command.length) {
          clearInterval(interval);
          setTimeout(() => {
            onTypingComplete?.();
          }, 300); // delay after typing
        }
      }, 50); // typing speed
      return () => clearInterval(interval);
    } else if (command && !isTyping) {
      // If not typing, wait for user click to show anything, so it stays blank initially
      setTypedCommand("");
    }
  }, [isTyping, command, onTypingComplete]);

  const timeString = new Date().toLocaleTimeString('en-US', { hour12: false });

  return (
    <div className="font-mono text-sm my-2 flex flex-col w-full">
      <div className="flex w-full justify-between items-center whitespace-nowrap overflow-hidden">
        <div className="flex items-center">
          <span className="text-[#6c6c6c]">╭─</span>
          <span className="bg-[#444444] text-[#eeeeee] px-1">  </span>
          <span className="bg-[#444444] text-[#0087af]">│  ~/src/main </span>
          <span className="bg-[#444444] text-[#5fdf00]">│ main </span>
          <span className="text-[#444444] bg-transparent"></span>
        </div>

        <div className="flex-grow text-[#6c6c6c] overflow-hidden text-clip mx-1 tracking-widest flex items-center">
          <span className="w-full truncate text-right">························································································································</span>
        </div>

        <div className="flex items-center">
          <span className="text-[#444444] bg-transparent"></span>
          <span className="bg-[#444444] text-[#5faf00]">  </span>
          <span className="bg-[#444444] text-[#a8a8a8]">│ 12ms </span>
          <span className="bg-[#444444] text-[#dfaf00]">│ ▼ </span>
          <span className="bg-[#444444] text-[#00afaf]">│  main </span>
          <span className="bg-[#444444] text-[#5f8787]">│ at {timeString}  </span>
          <span className="text-[#6c6c6c]"> ─╮ </span>
        </div>
      </div>
      <div className="flex items-center mt-1">
        <span className="text-[#6c6c6c]">╰─</span>
        <span className="text-[#5fdf00] ml-1">❯ </span>
        <span className="text-[#ebdbb2] ml-1">{typedCommand}</span>
        {(!command || isTyping) && <span className="animate-pulse w-2 h-4 bg-[#ebdbb2] ml-1 inline-block"></span>}
      </div>
    </div>
  );
}

export function TransientPrompt({ command }: { command: string }) {
  return (
    <div className="font-mono text-sm mb-2 flex items-center">
      <span className="text-[#5fdf00]">❯ </span>
      <span className="text-[#ebdbb2] ml-1">{command}</span>
    </div>
  );
}
