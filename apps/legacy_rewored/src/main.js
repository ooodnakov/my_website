import "./style.css";

const socials = [
  { label: "Telegram", href: "https://telegram.dnakov.ooo" },
  { label: "VK", href: "https://vk.dnakov.ooo" },
  { label: "Instagram", href: "https://instagram.dnakov.ooo" },
  { label: "Twitter/X", href: "https://twitter.dnakov.ooo" },
  { label: "GitHub", href: "https://github.dnakov.ooo" },
  { label: "How We Feel", href: "https://howwefeel.org/friends/824188" },
  { label: "E-mail", href: "mailto:me@dnakov.ooo" },
];

const intro = [
  {
    title: "Why @ooodnakov?",
    text: "Because I am me. The original handle, still in service.",
  },
  {
    title: "What can I do?",
    text: "Analytics, systems, product thinking, and the occasional internet artifact.",
  },
  {
    title: "What is this page?",
    text: "A Vite rebuild of the old projects page, with the raw historical version preserved in the archive.",
  },
];

const projects = [
  {
    eyebrow: "Video",
    title: "Cover recording documentary",
    description:
      "A piece about making a dorm-born rap cover and the strange beauty of student chaos.",
    href: "https://youtu.be/ILp3FTKG9Zg",
    image: "/legacy/archive/projects/files/cover-recording.png",
  },
  {
    eyebrow: "Artifact",
    title: "MySpace experiment",
    description: "An intentionally chaotic social page for CSS hackers and nostalgic browsers.",
    href: "https://myspace.windows93.net/index.php?id=216",
    image: "/legacy/archive/projects/files/project-myspace.png",
  },
  {
    eyebrow: "Math",
    title: "Odnakov's Lemma",
    description:
      "A very neat trigonometric fact that somehow turned into an actual named thing.",
    href: "https://www.geogebra.org/geometry/srsyvgca",
    image: "/legacy/archive/projects/files/project-lemma.svg",
  },
  {
    eyebrow: "Writing",
    title: "Intellectual articles",
    description:
      "A public page with the more thoughtful side of the feed, before and after the irony.",
    href: "https://vk.com/wall-168427103_141",
    image: "/legacy/archive/projects/img/O-between.svg",
  },
  {
    eyebrow: "Music",
    title: "2021 music era",
    description:
      "A snapshot of the 2021 sound phase, preserved as a post and an archive image.",
    href: "https://vk.com/wall-168427103_259",
    image: "/legacy/archive/projects/files/%D0%BE%D0%B1%D0%BB%D0%BE%D0%B6%D0%BA%D0%B0.png",
  },
];

const archives = [
  { label: "Projects archive", href: "/legacy/archive/projects/" },
  { label: "Events archive", href: "/legacy/archive/events/" },
  { label: "Gallery archive", href: "/legacy/archive/gallery/" },
  { label: "Video archive", href: "/legacy/archive/video/" },
  { label: "Download vCard", href: "https://vcard.dnakov.ooo" },
];

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="site-shell">
    <section class="hero">
      <div class="hero__glow hero__glow--one"></div>
      <div class="hero__glow hero__glow--two"></div>
      <div class="hero__copy">
        <div class="eyebrow">Projects Rebuilt</div>
        <h1>Aleksandr Odnakov</h1>
        <p class="lede">
          A modern Vite remake of the old projects site: internet experiments, math folklore, media fragments, and the archive behind them.
        </p>
        <div class="hero__actions">
          <a class="button button--primary" href="/cv/en">Open CV</a>
          <a class="button button--ghost" href="/legacy/archive/projects/">Open old archive</a>
        </div>
      </div>
      <div class="hero__card">
        <img src="/avatar.png" alt="Aleksandr Odnakov" class="hero__avatar" />
        <div class="hero__meta">
          <span>Yo, it's Sasha.</span>
          <strong>Projects, archives, and current pages.</strong>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section__header">
        <span class="eyebrow">Profile</span>
        <h2>Fast context</h2>
      </div>
      <div class="intro-grid">
        ${intro
          .map(
            (item) => `
              <article class="intro-card">
                <h3>${item.title}</h3>
                <p>${item.text}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <div class="section__header">
        <span class="eyebrow">Portfolio</span>
        <h2>Pieces of art</h2>
      </div>
      <div class="spotlight-grid">
        ${projects
          .map(
            (item) => `
              <a class="spotlight-card" href="${item.href}" target="_blank" rel="noopener noreferrer">
                <div class="spotlight-card__image" style="background-image:url('${item.image}')"></div>
                <div class="spotlight-card__body">
                  <span class="spotlight-card__eyebrow">${item.eyebrow}</span>
                  <h3>${item.title}</h3>
                  <p>${item.description}</p>
                </div>
              </a>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section section--two-col">
      <div>
        <div class="section__header">
          <span class="eyebrow">Social</span>
          <h2>Where to find me</h2>
        </div>
        <div class="pill-grid">
          ${socials
            .map(
              (item) => `
                <a class="pill-link" href="${item.href}" target="_blank" rel="noopener noreferrer">
                  <span>${item.label}</span>
                  <span class="pill-link__arrow">↗</span>
                </a>
              `,
            )
            .join("")}
        </div>
      </div>

      <div>
        <div class="section__header">
          <span class="eyebrow">Archive</span>
          <h2>Old code and pages</h2>
        </div>
        <div class="archive-list">
          ${archives
            .map(
              (item) => `
                <a class="archive-row" href="${item.href}">
                  <span>${item.label}</span>
                  <span>Open</span>
                </a>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  </main>
`;
