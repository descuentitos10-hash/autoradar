/**
 * Cloudflare Pages Function: /api/featured
 * Feed por defecto: 20 modelos populares en paralelo (~160 autos).
 * Sin análisis Claude para reducir latencia y costo.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MLA_AUTOS_CATEGORY = "MLA1744";
const CURRENT_YEAR = 2025;

// 20 modelos más buscados en Argentina
const POPULAR_QUERIES = [
  "Toyota Corolla",
  "Ford Ranger",
  "Volkswagen Amarok",
  "Chevrolet Onix",
  "Toyota Hilux",
  "VW Gol Trend",
  "Honda Civic",
  "Renault Duster",
  "Peugeot 208",
  "Fiat Cronos",
  "Volkswagen Golf",
  "Ford Focus",
  "Chevrolet Cruze",
  "Renault Sandero",
  "Toyota Etios",
  "Nissan Frontier",
  "Jeep Renegade",
  "Honda HR-V",
  "Volkswagen Vento",
  "Hyundai Tucson",
];

const RESULTS_PER_QUERY = 8;

function corsHeaders() {
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=180, stale-while-revalidate=360",
  };
}

async function getBlueRate() {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return 1200;
    const data = await r.json();
    return data.venta || 1200;
  } catch {
    return 1200;
  }
}

function extractAttribute(attributes, id) {
  const attr = (attributes || []).find(a => a.id === id);
  return attr ? attr.value_name || attr.values?.[0]?.name : null;
}

function normalizeToUSD(price, currency, blueRate) {
  if (currency === "USD") return price;
  return Math.round(price / blueRate);
}

function normalizeToARS(price, currency, blueRate) {
  if (currency === "ARS") return price;
  return Math.round(price * blueRate);
}

async function fetchPopularQuery(query, blueRate) {
  try {
    const url = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=${RESULTS_PER_QUERY}`;
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();

    return (data.results || [])
      .slice(0, RESULTS_PER_QUERY)
      .map(item => {
        const usd = normalizeToUSD(item.price, item.currency_id, blueRate);
        const ars = normalizeToARS(item.price, item.currency_id, blueRate);
        const km = extractAttribute(item.attributes, "KILOMETERS");
        const year = extractAttribute(item.attributes, "VEHICLE_YEAR");
        const brand = extractAttribute(item.attributes, "BRAND");
        const model = extractAttribute(item.attributes, "MODEL");

        return {
          id: `ml_${item.id}`,
          title: item.title,
          price_usd: usd,
          price_ars: ars,
          currency_original: item.currency_id,
          price_original: item.price,
          thumbnail: (item.thumbnail || "").replace("-I.jpg", "-O.jpg").replace("-I.webp", "-O.webp"),
          permalink: item.permalink,
          location: item.seller_address
            ? `${item.seller_address.city?.name || ""}, ${item.seller_address.state?.name || ""}`.replace(/^,\s*/, "")
            : "",
          km: km ? parseInt(km.replace(/\D/g, "")) || null : null,
          year: year ? parseInt(year) || null : null,
          brand,
          model,
          condition: item.condition === "new" ? "0km" : "usado",
          source: "mercadolibre",
          _query: query,
        };
      })
      .filter(item => item.price_usd > 0);
  } catch {
    return [];
  }
}

function calcScore(car, avgUsd) {
  let score = 50;
  if (avgUsd && car.price_usd) {
    const ratio = car.price_usd / avgUsd;
    if (ratio < 0.75) score += 35;
    else if (ratio < 0.85) score += 25;
    else if (ratio < 0.92) score += 15;
    else if (ratio > 1.3) score -= 25;
    else if (ratio > 1.2) score -= 15;
  }
  if (car.year) {
    const age = CURRENT_YEAR - car.year;
    if (age <= 3) score += 15;
    else if (age <= 5) score += 10;
    else if (age <= 8) score += 5;
    else if (age > 15) score -= 10;
  }
  if (car.km !== null && car.km !== undefined) {
    if (car.km < 30000) score += 15;
    else if (car.km < 80000) score += 8;
    else if (car.km > 150000) score -= 15;
  }
  if (car.thumbnail) score += 5;
  return Math.max(0, Math.min(100, score));
}

function calcStats(results) {
  if (!results.length) return null;
  const prices = results.map(r => r.price_usd).sort((a, b) => a - b);
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const median = prices.length % 2 === 0
    ? Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
    : prices[Math.floor(prices.length / 2)];
  return {
    count: results.length,
    avg_usd: avg,
    median_usd: median,
    min_usd: prices[0],
    max_usd: prices[prices.length - 1],
  };
}

export async function onRequestGet(context) {
  const cacheKey = new Request("https://cache.autoradar.com.ar/featured-v3");
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const blueRate = await getBlueRate();

    // 20 queries en paralelo
    const batches = await Promise.allSettled(
      POPULAR_QUERIES.map(q => fetchPopularQuery(q, blueRate))
    );

    // Mezclar intercalando: 1 de cada modelo → mejor diversidad en el feed
    const seen = new Set();
    const allByQuery = batches.map(b => b.status === "fulfilled" ? b.value : []);
    const maxLen = Math.max(...allByQuery.map(b => b.length));
    const all = [];
    for (let i = 0; i < maxLen; i++) {
      for (const batch of allByQuery) {
        if (batch[i] && !seen.has(batch[i].id)) {
          seen.add(batch[i].id);
          all.push(batch[i]);
        }
      }
    }

    const results = all.slice(0, 160);
    const stats = calcStats(results);

    // Agregar score
    const scored = results.map(r => ({ ...r, score: calcScore(r, stats?.avg_usd) }));

    const response = new Response(
      JSON.stringify({ results: scored, stats, blue_rate: blueRate, featured: true }),
      { headers: corsHeaders() }
    );

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Error al cargar el feed" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}
