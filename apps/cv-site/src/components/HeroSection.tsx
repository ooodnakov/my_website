import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface HeroSectionProps {
  name: string;
  subtitle: string;
  intro: string;
}

const HeroSection = ({ name, subtitle, intro }: HeroSectionProps) => {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center relative px-4 pb-44 md:pb-52">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="font-display text-6xl md:text-8xl lg:text-9xl font-light tracking-wide text-primary text-center"
      >
        {name}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="mt-6 font-body text-base md:text-lg tracking-[0.3em] uppercase text-muted-foreground"
      >
        {subtitle}
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 1.05 }}
        className="mt-6 max-w-3xl text-center font-body text-base md:text-lg leading-8 text-muted-foreground"
      >
        {intro}
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-28 md:bottom-32"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
