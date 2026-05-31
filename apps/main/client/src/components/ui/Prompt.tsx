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

  // Use line-height 1 to merge the block characters.
  // Let's use `border-dashed` to make it look like dots, but align it correctly via relative positioning.

  return (
    <div className="font-mono text-sm mt-4 mb-2 flex flex-col w-full" style={{ lineHeight: "1" }}>
      <div className="flex w-full justify-between items-center whitespace-nowrap overflow-hidden">
        <div className="flex items-center">
          <span className="text-[#6c6c6c]">╭─</span>
          <span className="bg-[#444444] text-[#eeeeee] px-1 h-full flex items-center">  </span>
          <span className="bg-[#444444] text-[#0087af] h-full flex items-center">│  ~/src/main </span>
          <span className="bg-[#444444] text-[#5fdf00] h-full flex items-center">│ main </span>
          <span className="text-[#444444] bg-transparent flex items-center"></span>
        </div>

        <div className="flex-grow flex items-center px-1">
           <div className="h-[1px] w-full border-t border-dashed border-[#6c6c6c]/50 relative top-[-1px]"></div>
        </div>

        <div className="flex items-center">
          <span className="text-[#444444] bg-transparent flex items-center"></span>
          <span className="bg-[#444444] text-[#5faf00] h-full flex items-center">  </span>
          <span className="bg-[#444444] text-[#a8a8a8] h-full flex items-center">│ 12ms </span>
          <span className="bg-[#444444] text-[#dfaf00] h-full flex items-center">│ ▼ </span>
          <span className="bg-[#444444] text-[#00afaf] h-full flex items-center">│  main </span>
          <span className="bg-[#444444] text-[#5f8787] h-full flex items-center">│ at {timeString}  </span>
          <span className="text-[#6c6c6c]"> ─╮</span>
        </div>
      </div>
      <div className="flex items-center">
        <span className="text-[#6c6c6c]">╰─</span>
        <span className="text-[#5fdf00] ml-1">❯ </span>
        <span className="text-[#ebdbb2] ml-1">{typedCommand}</span>
        {(!command || isTyping) && <span className="animate-pulse w-[8px] h-[15px] bg-[#ebdbb2] ml-[1px] inline-block align-text-bottom"></span>}
      </div>
    </div>
  );
}

export function TransientPrompt({ command }: { command: string }) {
  const timeString = new Date().toLocaleTimeString('en-US', { hour12: false });
  return (
    <div className="font-mono text-sm my-2 flex flex-col w-full opacity-80" style={{ lineHeight: "1" }}>
      <div className="flex w-full justify-between items-center whitespace-nowrap overflow-hidden">
        <div className="flex items-center">
          <span className="text-[#6c6c6c]">╭─</span>
          <span className="bg-[#444444] text-[#eeeeee] px-1 h-full flex items-center">  </span>
          <span className="bg-[#444444] text-[#0087af] h-full flex items-center">│  ~/src/main </span>
          <span className="bg-[#444444] text-[#5fdf00] h-full flex items-center">│ main </span>
          <span className="text-[#444444] bg-transparent flex items-center"></span>
        </div>

        <div className="flex-grow flex items-center px-1">
           <div className="h-[1px] w-full border-t border-dashed border-[#6c6c6c]/50 relative top-[-1px]"></div>
        </div>

        <div className="flex items-center">
          <span className="text-[#444444] bg-transparent flex items-center"></span>
          <span className="bg-[#444444] text-[#5faf00] h-full flex items-center">  </span>
          <span className="bg-[#444444] text-[#a8a8a8] h-full flex items-center">│ 12ms </span>
          <span className="bg-[#444444] text-[#dfaf00] h-full flex items-center">│ ▼ </span>
          <span className="bg-[#444444] text-[#00afaf] h-full flex items-center">│  main </span>
          <span className="bg-[#444444] text-[#5f8787] h-full flex items-center">│ at {timeString}  </span>
          <span className="text-[#6c6c6c]"> ─╮</span>
        </div>
      </div>
      <div className="flex items-center">
        <span className="text-[#6c6c6c]">╰─</span>
        <span className="text-[#5fdf00] ml-1">❯ </span>
        <span className="text-[#ebdbb2] ml-1">{command}</span>
      </div>
    </div>
  );
}
