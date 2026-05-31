import React from "react";

interface EzaRowProps {
  permissions: string;
  size: string;
  user: string;
  date: string;
  icon: string;
  name: string;
  url: string;
  target?: string;
  external?: boolean;
}

export function EzaRow({ permissions, size, user, date, icon, name, url, target, external }: EzaRowProps) {
  const colorizePerms = (perms: string) => {
    return perms.split("").map((char, i) => {
      let colorClass = "text-[#928374]"; // default dim
      if (char === "d") colorClass = "text-[#d79921]";
      else if (char === "l") colorClass = "text-[#83a598]";
      else if (char === "r") colorClass = "text-[#b8bb26]";
      else if (char === "w") colorClass = "text-[#d79921]";
      else if (char === "x") colorClass = "text-[#fb4934]";

      return <span key={i} className={colorClass}>{char}</span>;
    });
  };

  return (
    <div className="flex items-center gap-3 w-full group whitespace-pre">
      <div className="w-[10ch]">{colorizePerms(permissions)}</div>
      <div className="w-[6ch] text-right text-[#b8bb26]">{size}</div>
      <div className="w-[3ch] text-[#fabd2f]">{user}</div>
      <div className="w-[11ch] text-[#83a598]">{date}</div>
      <div className="flex-grow flex items-center gap-2">
        <span className="text-[#83a598] opacity-80">{icon}</span>
        <a
          href={url}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={`${target ? 'text-[#83a598]' : 'text-[#ebdbb2]'} hover:text-[#fe8019] hover:underline`}
        >
          {name}
        </a>
        {target && (
          <>
            <span className="text-[#928374] mr-1">{"->"}</span>
            <span className="text-[#ebdbb2]">{target}</span>
          </>
        )}
      </div>
    </div>
  );
}
