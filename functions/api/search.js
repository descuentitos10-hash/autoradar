/**
 * Cloudflare Pages Function: /api/search
 * Busca autos en MercadoLibre Argentina con análisis de precios via Claude.
 *
 * GET /api/search?q=gol+trend+2019
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MLA_AUTOS_CATEGORY = "MLA1744"; // Autos y Camionetas

function corsHeaders() {
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=120, stale-while-revalidate=240",
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

async function searchMercadoLibre(query, blueRate) {
  const url = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=48`;
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`ML API error: ${r.status}`);
  const data = await r.json();

  const results = (data.results || []).map(item => {
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
    };
  }).filter(item => item.price_usd > 0);

  return results;
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

async function analyzeWithClaude(query, stats, results, apiKey) {
  if (!apiKey || apiKey === "your_key_here") return null;

  // Top 5 listings for context
  const top5 = results.slice(0, 5).map(r =>
    `- ${r.title} | USD ${r.price_usd.toLocaleString()} | ${r.km ? r.km.toLocaleString() + " km" : "km n/d"} | ${r.year || "año n/d"} | ${r.location}`
  ).join("\n");

  const prompt = `Sos un experto en el mercado de autos usados de Argentina. Analizá estos resultados de búsqueda para "${query}" en MercadoLibre Argentina:

Estadísticas:
- ${stats.count} publicaciones encontradas
- Precio promedio: USD ${stats.avg_usd.toLocaleString()}
- Precio mediana: USD ${stats.median_usd.toLocaleString()}
- Rango: USD ${stats.min_usd.toLocaleString()} - USD ${stats.max_usd.toLocaleString()}

Top publicaciones:
${top5}

En 3-4 oraciones cortas y directas (en español argentino): ¿El mercado está caro o barato? ¿Cuál es el rango de precio justo? ¿Algo importante a tener en cuenta al comprar este auto?`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return new Response(JSON.stringify({ error: "Búsqueda muy corta" }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  // Cloudflare Cache
  const cacheKey = new Request(`https://cache.autoradar.com.ar/search?q=${encodeURIComponent(q.toLowerCase())}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const [blueRate, _] = await Promise.all([getBlueRate(), Promise.resolve()]);
    const results = await searchMercadoLibre(q, blueRate);

    if (!results.length) {
      return new Response(JSON.stringify({ results: [], stats: null, analysis: null, blue_rate: blueRate }), {
        headers: corsHeaders(),
      });
    }

    const stats = calcStats(results);
    const analysis = await analyzeWithClaude(q, stats, results, context.env?.ANTHROPIC_API_KEY);

    const response = new Response(
      JSON.stringify({ results, stats, analysis, blue_rate: blueRate, query: q }),
      { headers: corsHeaders() }
    );

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error al buscar" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}
