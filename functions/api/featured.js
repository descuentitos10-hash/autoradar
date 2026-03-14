/**
 * Cloudflare Pages Function: /api/featured
 * Devuelve ~48 autos populares para el feed por defecto.
 * Hace queries en paralelo por modelos populares, sin análisis Claude.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MLA_AUTOS_CATEGORY = "MLA1744";

const POPULAR_QUERIES = [
  "Toyota Corolla",
  "VW Gol Trend",
  "Ford Ranger",
  "Chevrolet Onix",
  "Honda Civic",
  "Renault Sandero",
  "Peugeot 208",
  "Fiat Cronos",
];

const RESULTS_PER_QUERY = 6;

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
    const url = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=8`;
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
          id: item.id,
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
          _query: query,
        };
      })
      .filter(item => item.price_usd > 0);
  } catch {
    return [];
  }
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
  // Cloudflare Cache
  const cacheKey = new Request("https://cache.autoradar.com.ar/featured-v1");
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const blueRate = await getBlueRate();

    // Fetch todos los modelos en paralelo
    const batches = await Promise.all(
      POPULAR_QUERIES.map(q => fetchPopularQuery(q, blueRate))
    );

    // Mezclar resultados y deduplicar por id
    const seen = new Set();
    const all = [];
    for (const batch of batches) {
      for (const item of batch) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      }
    }

    // Shufflear levemente (intercalar de cada query) y limitar a 48
    const results = all.slice(0, 48);

    const stats = calcStats(results);

    const response = new Response(
      JSON.stringify({ results, stats, blue_rate: blueRate, featured: true }),
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
