// Static domain-level rules. YouTube is deliberately excluded here —
// it's classified per-video by the LLM classifier instead (see background.js).

export const PRODUCTIVE_DOMAINS = [
  "github.com",
  "kaggle.com",
  "arxiv.org",
  "scholar.google.com",
  "stackoverflow.com",
  "colab.research.google.com",
  "leetcode.com",
  "huggingface.co",
  "paperswithcode.com",
  "docs.python.org",
  "developer.mozilla.org"
];

// Substring match against the full URL (path included), for sites where
// only part of the domain is productive (e.g. LinkedIn job search vs feed).
export const PRODUCTIVE_URL_PATTERNS = [
  "linkedin.com/jobs",
  "linkedin.com/job",
  "mail.google.com", // job/research email correspondence — adjust if too broad
];

export const UNPRODUCTIVE_DOMAINS = [
  "instagram.com",
  "netflix.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "facebook.com",
  "twitch.tv",
  "hulu.com",
  "primevideo.com",
  // free streaming / "watch" sites
  "aether.ist",
  "cinejoy.to",
  "movy.sx",
  "popcornmovies.ac",
  "bingebox.ac",
  "rivestream.app",
  "rivestream.ru",
  "rivestream.vip",
  "corsflix.net",
  "corsflix.dpdns.org",
  "flixer.gd",
  "flixer.su",
  "hexa.su",
  "bcine.ru",
  "bingey.cfd",
  "7movies.in",
  "7movies.pro",
  "shuttletv.su",
  "shuttletv.pk",
  "67movies.st",
  "phantomflix.net",
  "meowtv.ru",
  "flickystream.mov",
  "reelix.ac",
  "coreflix.tv"
];

/**
 * Classify a non-YouTube URL as "productive", "unproductive", or "neutral".
 */
export function classifyUrl(urlString) {
  let host = "";
  try {
    host = new URL(urlString).hostname.replace(/^www\./, "");
  } catch {
    return "neutral";
  }

  if (PRODUCTIVE_URL_PATTERNS.some((p) => urlString.includes(p))) {
    return "productive";
  }
  if (PRODUCTIVE_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
    return "productive";
  }
  if (UNPRODUCTIVE_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
    return "unproductive";
  }
  return "neutral";
}

export function isYouTube(urlString) {
  try {
    const host = new URL(urlString).hostname.replace(/^www\./, "");
    return host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}