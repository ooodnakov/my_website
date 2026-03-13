import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import type { HeroStat } from "@/content";

interface SnapshotSectionProps {
  items: HeroStat[];
}

const SnapshotSection = ({ items }: SnapshotSectionProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="px-4 max-w-5xl mx-auto mt-12 md:mt-20 relative">
      <div className="grid gap-4 md:grid-cols-4">
        {items.map((item, index) => (
          <motion.article
            key={item.label}
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, delay: index * 0.08 }}
            className="rounded-[28px] border border-border/70 bg-card/70 p-5 backdrop-blur-sm shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
          >
            <p className="mb-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">{item.label}</p>
            <h3 className="font-display text-3xl text-primary">{item.value}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
};

export default SnapshotSection;
