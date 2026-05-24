import { useToast } from "@/hooks/use-toast";
import { Language, homeContent } from "@/data/home";
import { Header, Hero, Footer, SectionRenderer } from "@/components/home";

interface HomeProps {
  lang: Language;
}

export default function Home({ lang }: HomeProps) {
  const { toast } = useToast();
  const page = homeContent[lang];
  const nextLang = lang === "en" ? "ru" : "en";

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ duration: 2000, className: "bg-[#282828] border-[#928374] text-[#ebdbb2]", title: page.copySuccess });
    } catch {
      toast({ duration: 2000, variant: "destructive", title: page.copyError });
    }
  };

  return (
    <div className="min-h-screen bg-[#282828] px-4 py-6 sm:px-8 sm:py-8 font-mono text-sm">
      <Header lang={lang} nextLang={nextLang} copyPageLink={copyPageLink} />

      <main className="mx-auto max-w-3xl">
        <Hero title={page.hero.title} desc={page.hero.desc} />

        {page.sections.map((section, index) => (
          <SectionRenderer key={index} section={section} />
        ))}

        <Footer />
      </main>
    </div>
  );
}
