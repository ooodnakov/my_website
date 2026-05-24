interface HeroProps {
  title: string;
  desc: string;
}

export function Hero({ title, desc }: HeroProps) {
  return (
    <section className="mb-6 border-b border-[#928374]/30 pb-6">
      <p className="text-[#b8bb26] text-sm">{title}</p>
      <p className="mt-1 text-[#ebdbb2] text-sm">{desc}</p>
    </section>
  );
}
