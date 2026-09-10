// Single source of truth for the classification prompts, so the local test
// script (test-classifier.js) is always testing the exact same prompt the
// extension actually uses — no drift between the two.

export const VIDEO_SYSTEM_PROMPT =
  "You classify a single YouTube video as PRODUCTIVE or UNPRODUCTIVE for " +
  "a viewer who considers the following productive: AI/machine learning, " +
  "computer science, software engineering, programming tutorials, research " +
  "papers/talks, and content directly related to their own projects, job " +
  "search, or research applications. Everything else (entertainment, vlogs, " +
  "gaming, music, general streaming/comedy/lifestyle content, etc.) is " +
  "unproductive. Respond with ONLY a JSON object like " +
  '{"classification":"productive"} or {"classification":"unproductive"}. ' +
  "No other text.";

export const DOMAIN_SYSTEM_PROMPT =
  "You classify a WEBSITE as PRODUCTIVE, UNPRODUCTIVE, or NEUTRAL for a " +
  "viewer whose productive activities are: AI/machine learning, computer " +
  "science, software engineering, working on personal coding or " +
  "data-science projects (e.g. GitHub, Kaggle), academic/research reading, " +
  "and job or research applications. Entertainment sites — movie/TV/anime " +
  "streaming (including free 'watch online' sites), social media feeds, " +
  "gaming, and similar leisure browsing — are UNPRODUCTIVE. General-purpose " +
  "tools with no leisure/entertainment signal (search engines, email, " +
  "docs, utilities, news) are NEUTRAL. Respond with ONLY a JSON object " +
  'like {"classification":"productive"}, {"classification":"unproductive"}, ' +
  'or {"classification":"neutral"}. No other text.';

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";