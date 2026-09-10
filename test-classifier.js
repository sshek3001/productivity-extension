// Run locally with Node (v18+, for built-in fetch): 
//   ANTHROPIC_API_KEY=sk-ant-... node test-classifier.js
//
// Uses the exact same prompts as the extension (imported from prompts.js),
// so a pass/fail here reflects what the extension will actually do.
// Every run's full results are also written to test-logs/<timestamp>.json
// so you can track accuracy over time as you tweak the prompts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIDEO_SYSTEM_PROMPT, DOMAIN_SYSTEM_PROMPT, HAIKU_MODEL } from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error(
    "Missing ANTHROPIC_API_KEY. Run as:\n" +
    "  ANTHROPIC_API_KEY=sk-ant-... node test-classifier.js"
  );
  process.exit(1);
}

async function callClaude(system, userContent) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 20,
      system,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const match = text.match(/"classification"\s*:\s*"(productive|unproductive|neutral)"/i);
  return {
    classification: match ? match[1].toLowerCase() : "neutral",
    raw: text,
    usage: data.usage || {}
  };
}

function loadCases() {
  const raw = fs.readFileSync(path.join(__dirname, "test-cases.json"), "utf8");
  return JSON.parse(raw);
}

async function runVideoCase(c) {
  const userContent =
    `Title: ${c.title}\nChannel: ${c.channel}\n` +
    (c.description ? `Description: ${c.description}` : "");
  const result = await callClaude(VIDEO_SYSTEM_PROMPT, userContent);
  return { ...c, actual: result.classification, raw: result.raw, usage: result.usage };
}

async function runDomainCase(c) {
  const userContent = `Domain: ${c.host}\nPage title: ${c.title || "(none)"}`;
  const result = await callClaude(DOMAIN_SYSTEM_PROMPT, userContent);
  return { ...c, actual: result.classification, raw: result.raw, usage: result.usage };
}

function printResult(kind, label, expected, actual) {
  const pass = expected === actual;
  const symbol = pass ? "✓" : "✗";
  console.log(`${symbol} [${kind}] ${label}  expected=${expected}  actual=${actual}`);
  return pass;
}

async function main() {
  const { videoCases = [], domainCases = [] } = loadCases();
  const results = [];
  let passCount = 0;
  let totalCost = 0;

  console.log(`Running ${videoCases.length} video cases + ${domainCases.length} domain cases...\n`);

  for (const c of videoCases) {
    const r = await runVideoCase(c);
    const pass = printResult("VIDEO", `"${r.title}" (${r.channel})`, r.expected, r.actual);
    if (pass) passCount++;
    const cost = (r.usage.input_tokens || 0) * 1e-6 + (r.usage.output_tokens || 0) * 5e-6;
    totalCost += cost;
    results.push({ kind: "video", ...r, pass });
  }

  for (const c of domainCases) {
    const r = await runDomainCase(c);
    const pass = printResult("DOMAIN", `${r.host} ("${r.title}")`, r.expected, r.actual);
    if (pass) passCount++;
    const cost = (r.usage.input_tokens || 0) * 1e-6 + (r.usage.output_tokens || 0) * 5e-6;
    totalCost += cost;
    results.push({ kind: "domain", ...r, pass });
  }

  const total = videoCases.length + domainCases.length;
  console.log(`\n${passCount}/${total} passed. Estimated cost of this run: $${totalCost.toFixed(6)}`);

  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.log("\nFailed cases:");
    for (const f of failed) {
      console.log(`  - [${f.kind}] ${f.title || f.host}: expected ${f.expected}, got ${f.actual}`);
    }
  }

  const logDir = path.join(__dirname, "test-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(
    logDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(
    logPath,
    JSON.stringify({ ranAt: new Date().toISOString(), passCount, total, totalCost, results }, null, 2)
  );
  console.log(`\nFull results logged to ${path.relative(__dirname, logPath)}`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});