import type { Language } from "@/content";
import { cvContent } from "@/content";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import HeroSection from "@/components/HeroSection";
import SnapshotSection from "@/components/SnapshotSection";
import TimelineSection from "@/components/TimelineSection";
import SkillsSection from "@/components/SkillsSection";
import ContactSection from "@/components/ContactSection";
import ThemeToggle from "@/components/ThemeToggle";

interface IndexProps {
  lang: Language;
}

const Index = ({ lang }: IndexProps) => {
  const content = cvContent[lang];
  return (
    <div className="relative z-10">
      <LanguageSwitcher lang={lang} />
      <ThemeToggle ariaLabel={content.toggleThemeLabel} />
      <HeroSection
        name={content.hero.name}
        subtitle={content.hero.subtitle}
        intro={content.hero.intro}
      />
      <SnapshotSection items={content.hero.stats} />
      <TimelineSection
        title={content.sections.experience}
        items={content.experienceItems}
        expandLabel={content.ui.expand}
        collapseLabel={content.ui.collapse}
      />
      <TimelineSection
        title={content.sections.community}
        items={content.communityItems}
        expandLabel={content.ui.expand}
        collapseLabel={content.ui.collapse}
      />
      <TimelineSection
        title={content.sections.education}
        items={content.educationItems}
        expandLabel={content.ui.expand}
        collapseLabel={content.ui.collapse}
      />
      <TimelineSection
        title={content.sections.achievements}
        items={content.achievementItems}
        expandLabel={content.ui.expand}
        collapseLabel={content.ui.collapse}
      />
      <SkillsSection
        title={content.sections.skills}
        skills={content.skills}
        expandLabel={content.ui.expand}
        collapseLabel={content.ui.collapse}
      />
      <ContactSection
        title={content.sections.contact}
        contacts={content.contacts}
        actions={content.actions}
        footer={content.footer}
      />
    </div>
  );
};

export default Index;
