import { TransientPrompt } from "../ui/Prompt";
interface HeroProps {
  title: string;
  desc: string;
}

export function Hero({ title, desc }: HeroProps) {
  return (
    <section className="mb-6 border-b border-[#928374]/30 pb-6">
      <TransientPrompt command={title.replace("❯ ", "")} />
      <div className="mt-3 p-3 bg-transparent">
        <p className="text-[#ebdbb2] text-sm">{desc}</p>
      </div>
    </section>
  );
}
