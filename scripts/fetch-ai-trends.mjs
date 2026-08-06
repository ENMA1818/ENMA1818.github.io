// Agrega tendencias de IA desde fuentes públicas y escribe data/ai-trends.json
// Corre en GitHub Actions con Node 20+ (fetch nativo, sin dependencias externas).

import { writeFile } from "node:fs/promises";

const MAX_ITEMS = 6;
const OUTPUT_PATH = new URL("../data/ai-trends.json", import.meta.url);

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, "").trim();
}

async function fetchHackerNews() {
  const url =
    "https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI%20OR%20artificial%20intelligence&numericFilters=points%3E30";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits || [])
    .filter((hit) => hit.title && hit.url)
    .slice(0, 6)
    .map((hit) => ({
      source: "Hacker News",
      type: "community",
      title: hit.title,
      url: hit.url,
      date: hit.created_at ? hit.created_at.slice(0, 10) : null,
      take: "",
    }));
}

async function fetchGoogleNews() {
  const url = "https://news.google.com/rss/search?q=inteligencia%20artificial&hl=es-419&gl=AR&ceid=AR:es-419";
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) && items.length < 6) {
    const block = match[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    if (!title || !link) continue;
    items.push({
      source: "Google News",
      type: "community",
      title: title.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
      url: link.trim(),
      date: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null,
      take: "",
    });
  }
  return items;
}

async function main() {
  const results = await Promise.allSettled([fetchHackerNews(), fetchGoogleNews()]);
  const collected = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const seen = new Set();
  const deduped = [];
  for (const item of collected) {
    const key = normalizeTitle(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  deduped.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const payload = {
    generated_at: new Date().toISOString(),
    items: deduped.slice(0, MAX_ITEMS),
  };

  if (payload.items.length === 0) {
    console.log("No se encontraron items nuevos, se mantiene el archivo existente.");
    return;
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`Escritos ${payload.items.length} items en data/ai-trends.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
