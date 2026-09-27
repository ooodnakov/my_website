import type { Language } from "@/data/home";

const siteOrigin = "https://dnakov.ooo";
const imageUrl = `${siteOrigin}/avatar.png`;

const copy = {
  en: {
    title: "Aleksandr Odnakov | Terminal Portfolio",
    description: "Terminal-first portfolio hub for Aleksandr Odnakov: CV, projects, archive, and contact links.",
    locale: "en_US",
  },
  ru: {
    title: "Александр Однаков | Терминальное портфолио",
    description: "Терминальный хаб Александра Однакова: CV, проекты, архив и контакты.",
    locale: "ru_RU",
  },
} satisfies Record<Language, { title: string; description: string; locale: string }>;

function routePath(lang: Language) {
  if (lang === "ru") return "/ru";
  if (typeof window !== "undefined" && window.location.pathname === "/en") return "/en";
  return "/";
}

function setMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  element.content = content;
}

function setNamedMeta(name: string, content: string) {
  setMeta(`meta[name="${name}"]`, () => {
    const element = document.createElement("meta");
    element.name = name;
    return element;
  }, content);
}

function setPropertyMeta(property: string, content: string) {
  setMeta(`meta[property="${property}"]`, () => {
    const element = document.createElement("meta");
    element.setAttribute("property", property);
    return element;
  }, content);
}

function setLink(selector: string, create: () => HTMLLinkElement, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  element.href = href;
}

function setCanonical(href: string) {
  setLink('link[rel="canonical"]', () => {
    const element = document.createElement("link");
    element.rel = "canonical";
    return element;
  }, href);
}

function setAlternate(hreflang: string, href: string) {
  setLink(`link[rel="alternate"][hreflang="${hreflang}"]`, () => {
    const element = document.createElement("link");
    element.rel = "alternate";
    element.hreflang = hreflang;
    return element;
  }, href);
}

function setPersonJsonLd(lang: Language) {
  const id = "person-jsonld";
  let element = document.getElementById(id) as HTMLScriptElement | null;
  if (!element) {
    element = document.createElement("script");
    element.id = id;
    element.type = "application/ld+json";
    document.head.appendChild(element);
  }

  element.text = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    name: lang === "ru" ? "Александр Однаков" : "Aleksandr Odnakov",
    alternateName: "ooodnakov",
    url: siteOrigin,
    image: imageUrl,
    jobTitle: lang === "ru" ? "Risk Analyst" : "Risk Analyst",
    knowsAbout: ["risk analytics", "product analytics", "data science", "forecasting", "web experiments"],
    sameAs: [
      "https://github.com/ooodnakov",
      "https://www.linkedin.com/in/ooodnakov/",
      "https://x.com/ooodnakov",
      "https://t.me/ooodnakov",
      "https://mastodon.social/@ooodnakov",
    ],
  });
}

export function applyHomeMetadata(lang: Language) {
  if (typeof document === "undefined") return;

  const metadata = copy[lang];
  const canonicalUrl = `${siteOrigin}${routePath(lang)}`;

  document.documentElement.lang = lang;
  document.title = metadata.title;

  setNamedMeta("description", metadata.description);
  setNamedMeta("twitter:card", "summary_large_image");
  setNamedMeta("twitter:site", "@ooodnakov");
  setNamedMeta("twitter:title", metadata.title);
  setNamedMeta("twitter:description", metadata.description);
  setNamedMeta("twitter:image", imageUrl);

  setPropertyMeta("og:title", metadata.title);
  setPropertyMeta("og:description", metadata.description);
  setPropertyMeta("og:type", "website");
  setPropertyMeta("og:url", canonicalUrl);
  setPropertyMeta("og:image", imageUrl);
  setPropertyMeta("og:locale", metadata.locale);

  setCanonical(canonicalUrl);
  setAlternate("en", `${siteOrigin}/en`);
  setAlternate("ru", `${siteOrigin}/ru`);
  setAlternate("x-default", `${siteOrigin}/`);
  setPersonJsonLd(lang);
}
