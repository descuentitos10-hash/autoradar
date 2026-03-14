/**
 * Cloudflare Pages Function: /api/search
 * Busca autos en MercadoLibre Argentina con filtros y análisis de precios via Claude.
 *
 * GET /api/search?q=corolla&condition=used&brand=Toyota&year_from=2018&year_to=2023
 *                &price_min_usd=5000&price_max_usd=20000&sort=price_asc
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MLA_AUTOS_CATEGORY = "MLA1744";

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

async function searchMercadoLibre(query, blueRate, params) {
  const { condition, sort, price_min_usd, price_max_usd } = params;

  let mlUrl = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=50`;

  if (condition === "new") mlUrl += "&item_condition=new";
  if (condition === "used") mlUrl += "&item_condition=used";

  // ML soporta price_asc / price_desc nativamente
  if (sort === "price_asc") mlUrl += "&sort=price_asc";
  if (sort === "price_desc") mlUrl += "&sort=price_desc";

  // Filtro de precio en ARS si viene precio USD
  if (price_min_usd > 0) {
    const arsMin = Math.round(price_min_usd * blueRate);
    mlUrl += `&price_min=${arsMin}`;
  }
  if (price_max_usd < 999999) {
    const arsMax = Math.round(price_max_usd * blueRate);
    mlUrl += `&price_max=${arsMax}`;
  }

  const r = await fetch(mlUrl, {
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

function applyBackendFilters(results, params) {
  const { brand, year_from, year_to, price_min_usd, price_max_usd, sort } = params;

  let filtered = results.filter(r => {
    // Filtro marca (en backend porque ML no lo soporta confiablemente)
    if (brand) {
      const titleAndBrand = `${r.title} ${r.brand || ""}`.toLowerCase();
      if (!titleAndBrand.includes(brand.toLowerCase())) return false;
    }
    // Filtro año
    if (r.year) {
      if (r.year < year_from || r.year > year_to) return false;
    }
    // Filtro precio USD (double-check, ML filtra por ARS aprox)
    if (r.price_usd < price_min_usd || r.price_usd > price_max_usd) return false;
    return true;
  });

  // Sort en backend para año y km (ML no los soporta)
  if (sort === "year_desc") filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (sort === "year_asc") filtered.sort((a, b) => (a.year || 0) - (b.year || 0));
  if (sort === "km_asc") filtered.sort((a, b) => (a.km || 999999) - (b.km || 999999));
  if (sort === "km_desc") filtered.sort((a, b) => (b.km || 0) - (a.km || 0));

  return filtered;
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

  // Leer todos los filtros
  const condition = url.searchParams.get("condition") || ""; // "new", "used", ""
  const brand = url.searchParams.get("brand") || "";
  const year_from = parseInt(url.searchParams.get("year_from")) || 0;
  const year_to = parseInt(url.searchParams.get("year_to")) || 9999;
  const price_min_usd = parseInt(url.searchParams.get("price_min_usd")) || 0;
  const price_max_usd = parseInt(url.searchParams.get("price_max_usd")) || 999999;
  const sort = url.searchParams.get("sort") || "price_asc";

  const filterParams = { condition, brand, year_from, year_to, price_min_usd, price_max_usd, sort };

  // Cache key incluye todos los filtros
  const cacheKey = new Request(
    `https://cache.autoradar.com.ar/search?q=${encodeURIComponent(q.toLowerCase())}&c=${condition}&b=${encodeURIComponent(brand)}&yf=${year_from}&yt=${year_to}&pmin=${price_min_usd}&pmax=${price_max_usd}&s=${sort}`
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const blueRate = await getBlueRate();
    const rawResults = await searchMercadoLibre(q, blueRate, filterParams);
    const results = applyBackendFilters(rawResults, filterParams);

    if (!results.length) {
      return new Response(
        JSON.stringify({ results: [], stats: null, analysis: null, blue_rate: blueRate }),
        { headers: corsHeaders() }
      );
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
    return new Response(
      JSON.stringify({ error: err.message || "Error al buscar" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}
