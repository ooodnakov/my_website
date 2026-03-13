import { AnimatePresence, motion, useInView } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import type { TimelineEntry } from "@/content";

interface TimelineSectionProps {
  title: string;
  items: TimelineEntry[];
  expandLabel: string;
  collapseLabel: string;
}

interface TimelineItemProps extends TimelineEntry {
  side: "left" | "right";
  index: number;
  expandLabel: string;
  collapseLabel: string;
}

const TimelineItem = ({
  period,
  title,
  subtitle,
  description,
  details,
  tags,
  side,
  index,
  expandLabel,
  collapseLabel,
}: TimelineItemProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-120px" });
  const [open, setOpen] = useState(index === 0);

  return (
    <div ref={ref} className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-start">
      <div className={`${side === "left" ? "md:text-right" : "md:opacity-0 md:pointer-events-none"} md:pr-8`}>
        {side === "left" && (
          <motion.button
            type="button"
            layout
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: index * 0.08 }}
            onClick={() => setOpen((value) => !value)}
            className="w-full rounded-[28px] border border-border/70 bg-card/70 p-6 text-left shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className={side === "left" ? "md:ml-auto" : ""}>
                <p className="font-body text-xs tracking-[0.28em] uppercase text-muted-foreground mb-3">
                  {period}
                </p>
                <h3 className="font-display text-2xl md:text-3xl font-medium text-foreground">{title}</h3>
                {subtitle && <p className="font-body text-base text-primary mt-2">{subtitle}</p>}
              </div>
              <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                <ChevronDown className="h-5 w-5 shrink-0 text-primary" />
              </motion.div>
            </div>

            {description && (
              <p className="font-body text-base text-muted-foreground mt-4 leading-relaxed">{description}</p>
            )}

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 20 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  {details && (
                    <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                      {details.map((detail) => (
                        <li key={detail} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tags && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary"
                        >
                          {tag}
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
        )}
      </div>

      <div className="hidden md:flex flex-col items-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : {}}
          transition={{ duration: 0.35, delay: index * 0.08 }}
          className="w-2.5 h-2.5 rounded-full bg-primary shrink-0"
        />
      </div>

      <div className={`${side === "right" ? "" : "md:opacity-0 md:pointer-events-none"} md:pl-8`}>
        {side === "right" && (
          <motion.button
            type="button"
            layout
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: index * 0.08 }}
            onClick={() => setOpen((value) => !value)}
            className="w-full rounded-[28px] border border-border/70 bg-card/70 p-6 text-left shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-xs tracking-[0.28em] uppercase text-muted-foreground mb-3">
                  {period}
                </p>
                <h3 className="font-display text-2xl md:text-3xl font-medium text-foreground">{title}</h3>
                {subtitle && <p className="font-body text-base text-primary mt-2">{subtitle}</p>}
              </div>
              <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                <ChevronDown className="h-5 w-5 shrink-0 text-primary" />
              </motion.div>
            </div>

            {description && (
              <p className="font-body text-base text-muted-foreground mt-4 leading-relaxed">{description}</p>
            )}

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 20 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  {details && (
                    <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                      {details.map((detail) => (
                        <li key={detail} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tags && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary"
                        >
                          {tag}
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
        )}
      </div>
    </div>
  );
};

const TimelineSection = ({ title, items, expandLabel, collapseLabel }: TimelineSectionProps) => {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-80px" });
  const lineRef = useRef(null);
  const lineInView = useInView(lineRef, { once: true, margin: "-50px" });

  return (
    <section className="py-20 md:py-32 px-4 max-w-5xl mx-auto relative">
      <motion.h2
        ref={titleRef}
        initial={{ opacity: 0, y: 20 }}
        animate={titleInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
        className="font-display text-4xl md:text-5xl font-light text-center mb-16 md:mb-24 tracking-wide text-foreground relative z-10"
      >
        <span className="bg-background px-6">{title}</span>
      </motion.h2>

      <div ref={lineRef} className="relative">
        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 -translate-x-px">
          <motion.div
            initial={{ height: 0 }}
            animate={lineInView ? { height: "100%" } : {}}
            transition={{ duration: 2, ease: "easeOut" }}
            className="w-px bg-primary/30 origin-top"
          />
        </div>

        <div className="space-y-12 md:space-y-14 relative">
          {items.map((item, i) => (
            <TimelineItem
              key={`${item.title}-${item.period}`}
              {...item}
              side={i % 2 === 0 ? "left" : "right"}
              index={i}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TimelineSection;
