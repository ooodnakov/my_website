import { AnimatePresence, motion, useInView } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import type { SkillEntry } from "@/content";

interface SkillsSectionProps {
  title: string;
  skills: SkillEntry[];
  expandLabel: string;
  collapseLabel: string;
}

const SkillsSection = ({ title, skills, expandLabel, collapseLabel }: SkillsSectionProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section ref={ref} className="py-20 md:py-32 px-4 max-w-4xl mx-auto">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
        className="font-display text-4xl md:text-5xl font-light text-center mb-16 tracking-wide text-foreground"
      >
        {title}
      </motion.h2>

      <div className="space-y-5">
        {skills.map((skill, index) => {
          const open = openIndex === index;
          return (
            <motion.button
              key={skill.category}
              type="button"
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.08 }}
              onClick={() => setOpenIndex(open ? -1 : index)}
              className="w-full rounded-[28px] border border-border/70 bg-card/70 p-6 text-left shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl text-primary">{skill.category}</h3>
                  <p className="mt-3 font-body text-base text-muted-foreground leading-relaxed">
                    {skill.detail}
                  </p>
                </div>
                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                  <ChevronDown className="h-5 w-5 shrink-0 text-primary" />
                </motion.div>
              </div>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="skill-details"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 20 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    {skill.items && (
                      <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                        {skill.items.map((item) => (
                          <li key={item} className="flex gap-3">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {skill.tools && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {skill.tools.map((tool) => (
                          <span
                            key={tool}
                            className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 text-xs uppercase tracking-[0.22em] text-primary/80">
                {open ? collapseLabel : expandLabel}
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
};

export default SkillsSection;
