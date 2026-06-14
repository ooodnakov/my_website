import { PageSection } from "@/data/home";
import {
  TerminalBlock,
  AboutLines,
  PreOutput,
  LinkOutput,
  CtaButton,
  SocialLinks,
  QuickLinks
} from "@/components/home";

interface SectionRendererProps {
  section: PageSection;
  timestamp?: string;
}

export function SectionRenderer({ section, timestamp }: SectionRendererProps) {
  switch (section.type) {
    case "social":
      return <SocialLinks links={section.data} prompt="❯ eza -la --icons --color=always socials/" className="text-sm" timestamp={timestamp} />;
    case "quickLinks":
      return <QuickLinks links={section.data} prompt="❯ eza -la --icons --color=always quicklinks/" className="text-sm" timestamp={timestamp} />;
    case "about":
      return (
        <TerminalBlock title={section.title || ""} className="text-sm" timestamp={timestamp}>
          <AboutLines lines={section.data.lines} />
        </TerminalBlock>
      );
    case "projects":
      return (
        <TerminalBlock title={section.title || ""} className="text-sm" timestamp={timestamp}>
          <div className="text-[#928374] underline mb-1 break-words">Permissions Size  User Date Modified  Name</div>
          <LinkOutput items={section.data.items} textColor="text-[#a89984]" />
        </TerminalBlock>
      );
    case "cv":
      return (
        <TerminalBlock title={section.title || ""} className="text-sm" timestamp={timestamp}>
          <PreOutput lines={section.data.items} />
          {section.data.ctaUrl && <CtaButton label="open /cv/-" url={section.data.ctaUrl} />}
        </TerminalBlock>
      );
    case "archive":
      return (
        <TerminalBlock title={section.title || ""} className="text-sm" timestamp={timestamp}>
          <LinkOutput items={section.data.items} textColor="text-[#83a598]" />
        </TerminalBlock>
      );
    default:
      return null;
  }
}
