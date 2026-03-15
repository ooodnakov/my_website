import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  Briefcase,
  ExternalLink,
  FileSearch,
  FileText,
  FolderOpen,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  ScrollText,
  Send,
  Share2,
  Twitch,
  Twitter,
  UserCircle,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Language = "en" | "ru";

interface HomeProps {
  lang: Language;
}

interface QuickLink {
  name: string;
  icon: typeof Mail;
  url: string;
  external?: boolean;
  tone?: "primary" | "default";
}

interface ProjectCard {
  eyebrow: string;
  title: string;
  description: string;
  url: string;
  external?: boolean;
}

interface ArchiveLink {
  name: string;
  url: string;
  description: string;
}

interface CvHighlight {
  period: string;
  title: string;
  detail: string;
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 13.83 13.83 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.108 13.108 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.359.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.876 19.876 0 0 0 6.002-3.03.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.095 2.157 2.418 0 1.333-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.095 2.157 2.418 0 1.333-.946 2.419-2.157 2.419Z" />
    </svg>
  );
}

function MastodonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M21.53 7.146c0-4.825-3.17-6.24-3.17-6.24C16.763.18 13.98.027 12.04 0h-.047c-1.94.027-4.724.18-6.32.907 0 0-3.17 1.415-3.17 6.24 0 1.105-.02 2.425.014 3.81.113 4.667.856 9.266 5.17 10.405 1.989.526 3.695.636 5.07.56 2.495-.139 3.893-.9 3.893-.9l-.083-1.817s-1.78.56-3.78.493c-1.982-.067-4.073-.213-4.393-2.64a4.992 4.992 0 0 1-.044-.668s1.944.476 4.406.59c1.506.07 2.918-.086 4.354-.258 2.756-.328 5.154-2.02 5.456-3.568.477-2.438.438-5.95.438-5.95Zm-3.56 5.99h-2.21V7.77c0-1.132-.477-1.706-1.433-1.706-1.055 0-1.583.678-1.583 2.018v2.936h-2.196V8.082c0-1.34-.528-2.018-1.583-2.018-.956 0-1.433.574-1.433 1.706v5.366H5.32V7.605c0-1.132.29-2.032.872-2.7.6-.667 1.386-1.01 2.36-1.01 1.127 0 1.979.43 2.55 1.291l.55.915.55-.915c.572-.86 1.423-1.291 2.55-1.291.974 0 1.76.343 2.36 1.01.582.668.872 1.568.872 2.7v5.53Z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.73h-3.195v12.693a2.896 2.896 0 1 1-2.895-2.895c.288 0 .57.044.84.128V8.632a6.09 6.09 0 0 0-.84-.058A6.091 6.091 0 1 0 15.82 14.665V8.228a7.977 7.977 0 0 0 4.678 1.513V6.686a4.76 4.76 0 0 1-.909 0Z" />
    </svg>
  );
}

const socials = [
  { name: "Discord", icon: DiscordIcon, url: "https://discord.com/users/ooodnakov" },
  { name: "Reddit", icon: MessageCircle, url: "https://www.reddit.com/user/OOOdnakov/" },
  { name: "X-twitter", icon: Twitter, url: "https://x.com/ooodnakov" },
  { name: "Twitch", icon: Twitch, url: "https://twitch.tv/ooodnakov" },
  { name: "Youtube", icon: Youtube, url: "https://youtube.com/TheCoolkaOS1" },
  { name: "Instagram", icon: Instagram, url: "https://www.instagram.com/ooodnakov" },
  { name: "Telegram", icon: Send, url: "https://t.me/ooodnakov" },
  { name: "Mastodon", icon: MastodonIcon, url: "https://mastodon.social/@ooodnakov" },
  { name: "Linkedin", icon: Linkedin, url: "https://www.linkedin.com/in/ooodnakov/" },
  { name: "Github", icon: Github, url: "https://github.com/OOOdnakov" },
  { name: "TikTok", icon: TikTokIcon, url: "https://www.tiktok.com/@ooodnakov" },
];

const sectionOrder = ["about", "projects", "cv", "archive", "contact"] as const;

const pageContent = {
  en: {
    hero: {
      eyebrow: "Main Site",
      title: "A links-first shell for projects, CV, archives, and current pages.",
      description:
        "This is still the main routing page. The difference is that it now has structure: quick exits first, context second.",
      status: "Current focus: keep the homepage useful as a hub, not a brochure.",
    },
    nav: {
      about: "About",
      projects: "Projects",
      cv: "CV",
      archive: "Archive",
      contact: "Contact",
    },
    quickLinksLabel: "Primary links",
    quickLinks: [
      { name: "Interactive CV", icon: FileText, url: "/cv/en", tone: "primary" },
      { name: "CV PDF (EN)", icon: ScrollText, url: "/cv-pdf/en" },
      { name: "CV PDF (RU)", icon: FileSearch, url: "/cv-pdf/ru" },
      { name: "Legacy archive", icon: FolderOpen, url: "/legacy/" },
      { name: "vCard", icon: UserCircle, url: "/vcard/828869858" },
      { name: "Email", icon: Mail, url: "mailto:ooodnakov@yandex.ru", external: true },
    ] satisfies QuickLink[],
    about: {
      eyebrow: "About",
      title: "Fast context, without turning the homepage into a wall of text.",
      description:
        "Analytics, risk modeling, internet experiments, educational projects, and a long tail of archived pages. The homepage points outward first, then gives enough context to know where each branch leads.",
      snapshotLabel: "Snapshot",
      bullets: [
        "Current work: risk and acquisition analytics.",
        "Previous layer: Yandex product and commercial analytics.",
        "Background: math olympiads, teaching, and side projects with too much internet energy.",
      ],
      stats: [
        { label: "Now", value: "T-Bank", detail: "Risk analyst building LTV logic." },
        { label: "Before", value: "Yandex", detail: "Antifraud, product, and deal analytics." },
        { label: "Education", value: "Skoltech + ICEF", detail: "Data science after economics." },
      ],
    },
    projects: {
      eyebrow: "Projects",
      title: "Selected outward-facing pieces.",
      items: [
        {
          eyebrow: "Video",
          title: "Cover recording documentary",
          description: "A dorm-born recording process turned into a video artifact.",
          url: "https://youtu.be/ILp3FTKG9Zg",
          external: true,
        },
        {
          eyebrow: "Artifact",
          title: "MySpace experiment",
          description: "An intentionally chaotic page for CSS hacks and browser nostalgia.",
          url: "https://myspace.windows93.net/index.php?id=216",
          external: true,
        },
        {
          eyebrow: "Math",
          title: "Odnakov's Lemma",
          description: "A compact trig result that escaped into the public internet.",
          url: "https://www.geogebra.org/geometry/srsyvgca",
          external: true,
        },
        {
          eyebrow: "Writing",
          title: "Intellectual articles",
          description: "A writing branch with the more deliberate side of the feed.",
          url: "https://vk.com/wall-168427103_141",
          external: true,
        },
      ] satisfies ProjectCard[],
    },
    cv: {
      eyebrow: "CV",
      title: "The CV has its own site, but the main page now exposes the core story.",
      description:
        "Use the dedicated CV view for the full timeline. Here, only the highest-signal points stay visible.",
      highlightsLabel: "Highlights",
      highlights: [
        {
          period: "2025 — present",
          title: "T-Bank",
          detail: "Risk analyst working on LTV and acquisition logic for medium-enterprise clients.",
        },
        {
          period: "2021 — 2025",
          title: "Yandex",
          detail: "Bonuses, audits, dashboards, forecasting, and commercial analytics.",
        },
        {
          period: "2018 — 2024",
          title: "Teaching + study",
          detail: "Math schools, ICEF, then MSc in Data Science at Skoltech.",
        },
      ] satisfies CvHighlight[],
      ctaLabel: "Open full CV site",
      ctaUrl: "/cv/en",
    },
    archive: {
      eyebrow: "Archive",
      title: "Legacy pages stay reachable and explicit.",
      items: [
        {
          name: "Projects archive",
          url: "/legacy/archive/projects/",
          description: "Old project pages and preserved artifacts.",
        },
        {
          name: "Events archive",
          url: "/legacy/archive/events/",
          description: "Historical event pages from the older site structure.",
        },
        {
          name: "Gallery archive",
          url: "/legacy/archive/gallery/",
          description: "Images and snapshots from earlier versions of the site.",
        },
        {
          name: "Video archive",
          url: "/legacy/archive/video/",
          description: "Video pages from the legacy branch.",
        },
      ] satisfies ArchiveLink[],
    },
    contact: {
      eyebrow: "Contact",
      title: "Direct links stay at the end, not hidden in a footer.",
      description:
        "If the homepage is the switchboard, this section is the clean version of that switchboard.",
      socialGraphTitle: "Social graph",
      socialGraphDescription: "Broad links, same visual language.",
      socialGraphNote:
        "The main page stays compact on purpose. Heavier material still lives in the dedicated CV and legacy branches.",
      actions: [
        { name: "Email", icon: Mail, url: "mailto:ooodnakov@yandex.ru", external: true },
        { name: "LinkedIn", icon: Linkedin, url: "https://www.linkedin.com/in/ooodnakov/", external: true },
        { name: "GitHub", icon: Github, url: "https://github.com/OOOdnakov", external: true },
      ] satisfies QuickLink[],
    },
    copySuccessTitle: "Link copied",
    copySuccessDescription: "This page URL is now in your clipboard.",
    copyErrorTitle: "Copy failed",
    copyErrorDescription: "Clipboard access is blocked in this browser.",
    avatarLabel: "Projects, archives, and current pages.",
  },
  ru: {
    hero: {
      eyebrow: "Главный сайт",
      title: "Links-first оболочка для проектов, CV, архива и текущих страниц.",
      description:
        "Главная все еще остается точкой перехода по ссылкам. Теперь у нее просто появилась структура: быстрые выходы сверху, контекст ниже.",
      status: "Текущая задача: оставить главную полезным хабом, а не превратить ее в брошюру.",
    },
    nav: {
      about: "О сайте",
      projects: "Проекты",
      cv: "CV",
      archive: "Архив",
      contact: "Контакты",
    },
    quickLinksLabel: "Основные ссылки",
    quickLinks: [
      { name: "Интерактивное CV", icon: FileText, url: "/cv/ru", tone: "primary" },
      { name: "CV PDF (EN)", icon: ScrollText, url: "/cv-pdf/en" },
      { name: "CV PDF (RU)", icon: FileSearch, url: "/cv-pdf/ru" },
      { name: "Легаси архив", icon: FolderOpen, url: "/legacy/" },
      { name: "vCard", icon: UserCircle, url: "/vcard/828869858" },
      { name: "Почта", icon: Mail, url: "mailto:ooodnakov@yandex.ru", external: true },
    ] satisfies QuickLink[],
    about: {
      eyebrow: "О сайте",
      title: "Быстрый контекст, но без превращения главной в длинное полотно текста.",
      description:
        "Аналитика, риск-модели, интернет-эксперименты, образовательные проекты и большой хвост архивных страниц. Главная сначала ведет наружу, а потом уже объясняет, куда именно.",
      snapshotLabel: "Сводка",
      bullets: [
        "Сейчас: риск и acquisition аналитика.",
        "До этого: продуктовая и коммерческая аналитика в Яндексе.",
        "Фон: олимпиадная математика, преподавание и сайд-проекты с выраженной интернет-энергией.",
      ],
      stats: [
        { label: "Сейчас", value: "Т-Банк", detail: "Risk analyst, LTV-логика." },
        { label: "До этого", value: "Яндекс", detail: "Антифрод, продукт, сделки." },
        { label: "Образование", value: "Сколтех + ICEF", detail: "Data science после экономики." },
      ],
    },
    projects: {
      eyebrow: "Проекты",
      title: "Несколько внешних точек входа.",
      items: [
        {
          eyebrow: "Видео",
          title: "Документалка про запись кавера",
          description: "Процесс студенческой записи, который сам стал артефактом.",
          url: "https://youtu.be/ILp3FTKG9Zg",
          external: true,
        },
        {
          eyebrow: "Артефакт",
          title: "MySpace experiment",
          description: "Нарочно хаотичная страница для CSS-хака и браузерной ностальгии.",
          url: "https://myspace.windows93.net/index.php?id=216",
          external: true,
        },
        {
          eyebrow: "Математика",
          title: "Odnakov's Lemma",
          description: "Компактный тригонометрический факт, ушедший в интернет.",
          url: "https://www.geogebra.org/geometry/srsyvgca",
          external: true,
        },
        {
          eyebrow: "Тексты",
          title: "Интеллектуальные статьи",
          description: "Более вдумчивая ветка контента до и после иронии.",
          url: "https://vk.com/wall-168427103_141",
          external: true,
        },
      ] satisfies ProjectCard[],
    },
    cv: {
      eyebrow: "CV",
      title: "У CV есть отдельный сайт, но основная история теперь видна и на главной.",
      description:
        "Для полного таймлайна есть отдельный CV-раздел. Здесь остаются только самые важные точки.",
      highlightsLabel: "Главное",
      highlights: [
        {
          period: "2025 — настоящее время",
          title: "Т-Банк",
          detail: "Risk analyst, LTV и acquisition логика для клиентов ME сегмента.",
        },
        {
          period: "2021 — 2025",
          title: "Яндекс",
          detail: "Бонусы, аудит, дашборды, прогнозирование и коммерческая аналитика.",
        },
        {
          period: "2018 — 2024",
          title: "Преподавание + учеба",
          detail: "Математические школы, ICEF, затем MSc in Data Science в Сколтехе.",
        },
      ] satisfies CvHighlight[],
      ctaLabel: "Открыть полное CV",
      ctaUrl: "/cv/ru",
    },
    archive: {
      eyebrow: "Архив",
      title: "Легаси-страницы остаются доступными и явными.",
      items: [
        {
          name: "Архив проектов",
          url: "/legacy/archive/projects/",
          description: "Старые проектные страницы и сохраненные артефакты.",
        },
        {
          name: "Архив событий",
          url: "/legacy/archive/events/",
          description: "Исторические event-страницы из старой структуры сайта.",
        },
        {
          name: "Архив галереи",
          url: "/legacy/archive/gallery/",
          description: "Изображения и снимки из прежних версий сайта.",
        },
        {
          name: "Архив видео",
          url: "/legacy/archive/video/",
          description: "Видео-раздел из легаси-ветки.",
        },
      ] satisfies ArchiveLink[],
    },
    contact: {
      eyebrow: "Контакты",
      title: "Прямые ссылки остаются на виду, а не прячутся в футере.",
      description:
        "Если главная это switchboard, то здесь находится его аккуратная финальная версия.",
      socialGraphTitle: "Соцсети",
      socialGraphDescription: "Широкий набор ссылок в том же визуальном языке.",
      socialGraphNote:
        "Главная специально остается компактной. Более тяжелый материал по-прежнему живет в отдельном CV и в легаси-ветках.",
      actions: [
        { name: "Почта", icon: Mail, url: "mailto:ooodnakov@yandex.ru", external: true },
        { name: "LinkedIn", icon: Linkedin, url: "https://www.linkedin.com/in/ooodnakov/", external: true },
        { name: "GitHub", icon: Github, url: "https://github.com/OOOdnakov", external: true },
      ] satisfies QuickLink[],
    },
    copySuccessTitle: "Ссылка скопирована",
    copySuccessDescription: "Адрес этой страницы уже в буфере обмена.",
    copyErrorTitle: "Не удалось скопировать",
    copyErrorDescription: "Браузер не дал доступ к буферу обмена.",
    avatarLabel: "Проекты, архив и текущие страницы.",
  },
} as const;

const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.45, ease: "easeOut" as const },
};

export default function Home({ lang }: HomeProps) {
  const { toast } = useToast();
  const page = pageContent[lang];
  const nextLang = lang === "en" ? "ru" : "en";

  const copyPageLink = async () => {
    const url = window.location.href;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      toast({
        duration: 2600,
        className: "border-primary/30 bg-black/85 text-white backdrop-blur-xl",
        title: page.copySuccessTitle,
        description: page.copySuccessDescription,
      });
    } catch {
      toast({
        duration: 3200,
        variant: "destructive",
        title: page.copyErrorTitle,
        description: page.copyErrorDescription,
      });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute left-1/4 top-24 -z-10 h-96 w-96 rounded-full bg-primary/20 blur-[128px] mix-blend-screen" />
      <div className="pointer-events-none absolute bottom-24 right-1/4 -z-10 h-96 w-96 rounded-full bg-accent/20 blur-[128px] mix-blend-screen" />

      <Link
        href={`/${nextLang}`}
        className="absolute left-4 top-4 z-20 rounded-full border border-white/10 bg-black/20 px-2 py-2 backdrop-blur-xl sm:left-8 sm:top-8"
        title={`Switch language to ${nextLang.toUpperCase()}`}
        aria-label={`Switch language to ${nextLang.toUpperCase()}`}
      >
        <span className="relative flex min-w-24 items-center rounded-full text-xs font-semibold tracking-[0.2em] text-white/70">
          <span
            className={`absolute bottom-0 top-0 w-1/2 rounded-full bg-primary transition-transform duration-300 ${
              lang === "en" ? "translate-x-0" : "translate-x-full"
            }`}
          />
          <span className={`relative z-10 flex-1 px-3 py-1 text-center transition-colors ${lang === "en" ? "text-black" : "text-white/70"}`}>
            EN
          </span>
          <span className={`relative z-10 flex-1 px-3 py-1 text-center transition-colors ${lang === "ru" ? "text-black" : "text-white/70"}`}>
            RU
          </span>
        </span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="absolute right-4 top-4 sm:right-8 sm:top-8"
      >
        <Button
          variant="ghost"
          size="icon"
          className="glass-panel-interactive h-10 w-10 rounded-full text-muted-foreground hover:text-primary"
          onClick={copyPageLink}
          title="Copy page link"
          aria-label="Copy page link"
        >
          <Share2 className="h-5 w-5" />
        </Button>
      </motion.div>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 pt-16 sm:pt-20">
        <motion.section
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="glass-panel overflow-hidden rounded-[32px] border border-white/10 p-5 sm:p-8"
        >
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
            <div>
              <span className="mb-4 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                {page.hero.eyebrow}
              </span>
              <h1 className="max-w-4xl text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                {page.hero.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-gray-300 sm:text-lg">
                {page.hero.description}
              </p>
              <p className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70">
                {page.hero.status}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {sectionOrder.map((sectionId) => (
                  <a
                    key={sectionId}
                    href={`#${sectionId}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:border-primary/40 hover:text-white"
                  >
                    {page.nav[sectionId]}
                  </a>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="relative mx-auto w-full max-w-sm rounded-[28px] border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
                <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.16),_transparent_42%)]" />
                <div className="relative">
                  <div className="mx-auto mb-4 w-32 rounded-[24px] bg-white/5 p-1 sm:w-36">
                    <img
                      src="/avatar.png"
                      alt="Aleksandr Odnakov Avatar"
                      className="aspect-square w-full rounded-[20px] object-cover"
                    />
                  </div>
                  <p className="text-center text-sm uppercase tracking-[0.22em] text-primary/80">
                    Aleksandr Odnakov
                  </p>
                  <p className="mt-2 text-center text-sm leading-6 text-white/70">
                    {page.avatarLabel}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-accent/80">
                    {page.quickLinksLabel}
                  </span>
                  <ArrowRight className="h-4 w-4 text-accent/70" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {page.quickLinks.map((link) => (
                    <a
                      key={link.name}
                      href={link.url}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className={`group rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${
                        link.tone === "primary"
                          ? "border-primary/30 bg-primary/10 text-white hover:border-primary hover:bg-primary/15"
                          : "border-white/10 bg-black/20 text-white/80 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="mb-3 inline-flex rounded-xl bg-white/10 p-2 text-primary">
                            <link.icon className="h-5 w-5" />
                          </div>
                          <p className="text-base font-semibold">{link.name}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          className="grid gap-4"
          id="about"
        >
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              {page.about.eyebrow}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="glass-panel rounded-[28px] border border-white/10 p-6">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">{page.about.title}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-300 sm:text-base">
                {page.about.description}
              </p>
              <div className="mt-6 grid gap-3">
                {page.about.bullets.map((bullet) => (
                  <div
                    key={bullet}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/80"
                  >
                    {bullet}
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-panel rounded-[28px] border border-white/10 p-6">
              <div className="mb-5 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.22em] text-white/60">
                {page.about.snapshotLabel}
              </div>
              <div className="grid gap-3">
                {page.about.stats.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-accent/80">{item.label}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{item.value}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/70">{item.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </motion.section>

        <motion.section {...reveal} id="projects" className="glass-panel rounded-[28px] border border-white/10 p-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                {page.projects.eyebrow}
              </span>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{page.projects.title}</h2>
            </div>
            <a
              href="/legacy/archive/projects/"
              className="hidden rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70 transition-colors hover:border-primary/40 hover:text-white sm:inline-flex"
            >
              Open archive
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {page.projects.items.map((item) => (
              <a
                key={item.title}
                href={item.url}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="group rounded-[24px] border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-accent/80">{item.eyebrow}</span>
                    <h3 className="mt-3 text-xl font-semibold text-white">{item.title}</h3>
                  </div>
                  <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <p className="mt-4 text-sm leading-7 text-white/70">{item.description}</p>
              </a>
            ))}
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          id="cv"
          className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <section className="glass-panel rounded-[28px] border border-white/10 p-6">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              {page.cv.eyebrow}
            </span>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{page.cv.title}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-300 sm:text-base">
              {page.cv.description}
            </p>
            <a
              href={page.cv.ctaUrl}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-primary hover:bg-primary/15"
            >
              <FileText className="h-4 w-4 text-primary" />
              {page.cv.ctaLabel}
            </a>
          </section>

          <section className="glass-panel rounded-[28px] border border-white/10 p-6">
            <div className="mb-4 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.22em] text-white/60">
              {page.cv.highlightsLabel}
            </div>
            <div className="grid gap-3">
              {page.cv.highlights.map((item) => (
                <article
                  key={`${item.period}-${item.title}`}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-accent/80">{item.period}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </motion.section>

        <motion.section {...reveal} id="archive" className="glass-panel rounded-[28px] border border-white/10 p-6">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
            {page.archive.eyebrow}
          </span>
          <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{page.archive.title}</h2>
          <div className="mt-6 grid gap-3">
            {page.archive.items.map((item) => (
              <a
                key={item.name}
                href={item.url}
                className="group flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div className="flex gap-4">
                  <div className="mt-0.5 rounded-xl bg-black/20 p-2 text-primary">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-sm leading-6 text-white/70">{item.description}</p>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          id="contact"
          className="grid gap-4 lg:grid-cols-[1fr_1.15fr]"
        >
          <section className="glass-panel rounded-[28px] border border-white/10 p-6">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              {page.contact.eyebrow}
            </span>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{page.contact.title}</h2>
            <p className="mt-4 text-sm leading-7 text-gray-300 sm:text-base">
              {page.contact.description}
            </p>
            <div className="mt-6 grid gap-3">
              {page.contact.actions.map((item) => (
                <a
                  key={item.name}
                  href={item.url}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white/80 transition-colors hover:border-primary/30 hover:text-white"
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 text-primary" />
                    {item.name}
                  </span>
                  <ArrowRight className="h-4 w-4 text-white/50 transition-transform group-hover:translate-x-0.5" />
                </a>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-[28px] border border-white/10 p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{page.contact.socialGraphTitle}</p>
                <p className="text-sm text-white/60">{page.contact.socialGraphDescription}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {socials.map((social) => (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
                  title={social.name}
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/65">
              <Globe className="mb-3 h-4 w-4 text-accent/80" />
              {page.contact.socialGraphNote}
            </div>
          </section>
        </motion.section>
      </main>
    </div>
  );
}
