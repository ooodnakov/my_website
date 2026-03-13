import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import type { ActionEntry, ContactEntry } from "@/content";

interface ContactSectionProps {
  title: string;
  contacts: ContactEntry[];
  actions: ActionEntry[];
  footer: string;
}

const ContactSection = ({ title, contacts, actions, footer }: ContactSectionProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-20 md:py-32 px-4 max-w-3xl mx-auto mb-20">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
        className="font-display text-4xl md:text-5xl font-light text-center mb-16 tracking-wide text-foreground"
      >
        {title}
      </motion.h2>

      <div className="flex flex-col items-center space-y-6">
        {contacts.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: i * 0.15 }}
            className="text-center"
          >
            <p className="font-body text-sm tracking-[0.2em] uppercase text-muted-foreground mb-1">{c.label}</p>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-base text-primary gold-bloom hover:underline underline-offset-4"
            >
              {c.text}
            </a>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
        {actions.map((action, index) => (
          <motion.a
            key={action.label}
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.08 }}
            href={action.href}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noopener noreferrer" : undefined}
            className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-primary transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
          >
            {action.label}
          </motion.a>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 1, duration: 1 }}
        className="text-center mt-20 font-body text-xs text-muted-foreground/50 tracking-wider"
      >
        {footer}
      </motion.p>
    </section>
  );
};

export default ContactSection;
