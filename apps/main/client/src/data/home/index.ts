export type Language = "en" | "ru";

export interface SocialLink {
  name: string;
  icon: string;
  url: string;
}

export interface QuickLink {
  icon: string;
  name: string;
  url: string;
  title: string;
  external?: boolean;
}

export interface ContentLine {
  line: string;
  type: "border" | "file" | "content";
}

export interface ProjectItem {
  name: string;
  url: string;
  external?: boolean;
}

export interface CvItem {
  year: string;
  company: string;
  desc: string;
}

export interface ArchiveItem {
  name: string;
  url: string;
}

export type SectionType = "about" | "projects" | "cv" | "archive" | "social" | "quickLinks";

export interface PageSection {
  type: SectionType;
  title?: string;
  data: any; // We'll map this dynamically in the renderer
}

export interface PageContent {
  hero: {
    title: string;
    desc: string;
  };
  sections: PageSection[];
  copySuccess: string;
  copyError: string;
}

const socials: SocialLink[] = [
  { name: "Discord", icon: "", url: "https://discord.com/users/oouser" },
  { name: "Reddit", icon: "", url: "https://www.reddit.com/user/OOOdnakov/" },
  { name: "X", icon: "", url: "https://x.com/oouser" },
  { name: "Twitch", icon: "", url: "https://twitch.tv/oouser" },
  { name: "YT", icon: "", url: "https://youtube.com/TheCoolkaOS1" },
  { name: "IG", icon: "", url: "https://www.instagram.com/oouser" },
  { name: "TG", icon: "", url: "https://t.me/oouser" },
  { name: "Mastodon", icon: "", url: "https://mastodon.social/@oouser" },
  { name: "LI", icon: "", url: "https://www.linkedin.com/in/oouser/" },
  { name: "GH", icon: "", url: "https://github.com/OOOdnakov" },
  { name: "TT", icon: "󰎇", url: "https://www.tiktok.com/@oouser" },
];

export const homeContent: Record<Language, PageContent> = {
  en: {
    hero: {
      title: "❯ bat index.txt",
      desc: "Terminal-ready hub. Links first, context second.",
    },
    sections: [
      {
        type: "social",
        data: socials
      },
      {
        type: "quickLinks",
        data: [
          { icon: "", name: "CV", url: "/cv/en", title: "Interactive CV" },
          { icon: "", name: "PDF EN", url: "/cv-pdf/en", title: "CV PDF English" },
          { icon: "", name: "PDF RU", url: "/cv-pdf/ru", title: "CV PDF Russian" },
          { icon: "", name: "Archive", url: "/legacy/", title: "Legacy archive" },
          { icon: "", name: "vCard", url: "/vcard/828869858", title: "vCard" },
          { icon: "", name: "Mail", url: "mailto:oouser@yandex.ru", external: true, title: "Email" },
        ]
      },
      {
        type: "about",
        title: "❯ bat README.md",
        data: {
          lines: [
            { line: "───────┬────────────────────────────────────────────────────────────────────────", type: "border" },
            { line: "       │ File: README.md", type: "file" },
            { line: "───────┼────────────────────────────────────────────────────────────────────────", type: "border" },
            { line: "   1   │ Analytics, risk, experiments, archives.", type: "content" },
            { line: "   2   │ Homepage points outward first, then gives context.", type: "content" },
            { line: "   3   │", type: "content" },
            { line: "   4   │ current: risk  analytics @ T-Bank", type: "content" },
            { line: "   5   │ previous: Yandex product + commercial analytics", type: "content" },
            { line: "   6   │ background: math olympiads, teaching, side projects", type: "content" },
            { line: "───────┴────────────────────────────────────────────────────────────────────────", type: "border" },
          ]
        }
      },
      {
        type: "projects",
        title: "❯ eza -la projects/",
        data: {
          items: [
            { name: "drwxr-xr-x    12  user   12 Oct 2020  cover-doc", url: "https://youtu.be/ILp3FTKG9Zg", external: true },
            { name: "-rw-r--r--  1.2k  user    9 Sep 2019  myspace-exp", url: "https://myspace.windows93.net/index.php?id=216", external: true },
            { name: "-rwxr-xr-x     1  user    1 Jan 2019  lemma", url: "https://www.geogebra.org/geometry/srsyvgca", external: true },
            { name: "-rw-r--r--   512  user   30 Aug 2016  articles", url: "https://vk.com/wall-168427103_141", external: true },
          ]
        }
      },
      {
        type: "cv",
        title: "❯ head -n3 cv.txt",
        data: {
          items: [
            "2025--   T-Bank           risk analyst, LTV + acquisition",
            "2021-25  Yandex           bonuses, audits, dashboards, forecasting",
            "2018-24  Skoltech+ICEF    MSc Data Science",
          ],
          ctaUrl: "/cv/en"
        }
      },
      {
        type: "archive",
        title: "❯ fd -d 1 -t d . archive/",
        data: {
          items: [
            { name: "archive/projects/", url: "/legacy/archive/projects/" },
            { name: "archive/events/", url: "/legacy/archive/events/" },
            { name: "archive/gallery/", url: "/legacy/archive/gallery/" },
            { name: "archive/video/", url: "/legacy/archive/video/" },
          ]
        }
      }
    ],
    copySuccess: "Link copied.",
    copyError: "Copy failed.",
  },
  ru: {
    hero: {
      title: "❯ bat index.txt",
      desc: "Terminal-ready хаб. Ссылки сначала, контекст потом.",
    },
    sections: [
      {
        type: "social",
        data: socials
      },
      {
        type: "quickLinks",
        data: [
          { icon: "", name: "CV", url: "/cv/ru", title: "Интерактивное CV" },
          { icon: "", name: "PDF EN", url: "/cv-pdf/en", title: "CV PDF English" },
          { icon: "", name: "PDF RU", url: "/cv-pdf/ru", title: "CV PDF Russian" },
          { icon: "", name: "Архив", url: "/legacy/", title: "Легаси архив" },
          { icon: "", name: "vCard", url: "/vcard/828869858", title: "vCard" },
          { icon: "", name: "Почта", url: "mailto:oouser@yandex.ru", external: true, title: "Почта" },
        ]
      },
      {
        type: "about",
        title: "❯ bat README.md",
        data: {
          lines: [
            { line: "───────┬────────────────────────────────────────────────────────────────────────", type: "border" },
            { line: "       │ File: README.md", type: "file" },
            { line: "───────┼────────────────────────────────────────────────────────────────────────", type: "border" },
            { line: "   1   │ Аналитика, риски, эксперименты, архивы.", type: "content" },
            { line: "   2   │ Главная сначала ведет наружу, потом объясняет.", type: "content" },
            { line: "   3   │", type: "content" },
            { line: "   4   │ сейчас: риск аналитика @ Т-Банк", type: "content" },
            { line: "   5   │ до этого: Яндекс продукт + коммерция", type: "content" },
            { line: "   6   │ фон: олимпиады, преподавание, сайд-проекты", type: "content" },
            { line: "───────┴────────────────────────────────────────────────────────────────────────", type: "border" },
          ]
        }
      },
      {
        type: "projects",
        title: "❯ eza -la projects/",
        data: {
          items: [
            { name: "drwxr-xr-x    12  user   12 Окт  2020  cover-doc", url: "https://youtu.be/ILp3FTKG9Zg", external: true },
            { name: "-rw-r--r--  1.2k  user    9 Сен  2019  myspace-exp", url: "https://myspace.windows93.net/index.php?id=216", external: true },
            { name: "-rwxr-xr-x     1  user    1 Янв  2019  lemma", url: "https://www.geogebra.org/geometry/srsyvgca", external: true },
            { name: "-rw-r--r--   512  user   30 Авг 2016  articles", url: "https://vk.com/wall-168427103_141", external: true },
          ]
        }
      },
      {
        type: "cv",
        title: "❯ head -n3 cv.txt",
        data: {
          items: [
            "2025--   Т-Банк          risk analyst, LTV + acquisition",
            "2021-25  Яндекс          бонусы, аудит, дашборды, прогноз",
            "2018-24  Сколтех+ICEF    MSc Data Science",
          ],
          ctaUrl: "/cv/ru"
        }
      },
      {
        type: "archive",
        title: "❯ fd -d 1 -t d . archive/",
        data: {
          items: [
            { name: "archive/projects/", url: "/legacy/archive/projects/" },
            { name: "archive/events/", url: "/legacy/archive/events/" },
            { name: "archive/gallery/", url: "/legacy/archive/gallery/" },
            { name: "archive/video/", url: "/legacy/archive/video/" },
          ]
        }
      }
    ],
    copySuccess: "Ссылка скопирована.",
    copyError: "Не удалось скопировать.",
  },
};
