export const PORTFOLIO_LINK_IDS = Object.freeze([
  "quick-cv",
  "quick-pdf-en",
  "quick-pdf-ru",
  "quick-archive",
  "quick-vcard",
  "quick-mail",
  "social-discord",
  "social-reddit",
  "social-x",
  "social-twitch",
  "social-yt",
  "social-ig",
  "social-tg",
  "social-mastodon",
  "social-li",
  "social-gh",
  "social-tt",
  "project-cover-doc",
  "project-myspace-exp",
  "project-lemma",
  "project-articles",
  "archive-projects",
  "archive-events",
  "archive-gallery",
  "archive-video",
]);

export function assertPortfolioLinkIds(ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate portfolio action ID: ${id}`);
    seen.add(id);
  }
  const unknown = [...seen].filter(id => !PORTFOLIO_LINK_IDS.includes(id));
  const missing = PORTFOLIO_LINK_IDS.filter(id => !seen.has(id));
  if (unknown.length || missing.length) {
    throw new Error(`Portfolio action IDs changed; unknown=${unknown.join(",")} missing=${missing.join(",")}`);
  }
}
