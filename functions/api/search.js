/**
 * Cloudflare Pages Function: /api/search
 * Agrega MercadoLibre (4 páginas paralelas = 200 resultados) + Kavak Argentina.
 * Deduplicación inteligente, scoring y análisis Claude.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MLA_AUTOS_CATEGORY = "MLA1744";
const CURRENT_YEAR = 2025;

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

// ── MercadoLibre: una página de 50 con offset ─────────────────────────────

async function fetchMLPage(query, blueRate, params, offset) {
  const { condition, sort, price_min_usd, price_max_usd } = params;

  let mlUrl = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=50&offset=${offset}`;

  if (condition === "new") mlUrl += "&item_condition=new";
  if (condition === "used") mlUrl += "&item_condition=used";
  if (sort === "price_asc") mlUrl += "&sort=price_asc";
  if (sort === "price_desc") mlUrl += "&sort=price_desc";
  if (price_min_usd > 0) mlUrl += `&price_min=${Math.round(price_min_usd * blueRate)}`;
  if (price_max_usd < 999999) mlUrl += `&price_max=${Math.round(price_max_usd * blueRate)}`;

  const r = await fetch(mlUrl, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];

  const data = await r.json();
  return (data.results || []).map(item => {
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
    };
  }).filter(item => item.price_usd > 0);
}

// ── Kavak Argentina ────────────────────────────────────────────────────────

async function fetchKavak(query, blueRate) {
  try {
    const url = `https://www.kavak.com/api/3.0/inventory?country_code=ar&limit=12&search=${encodeURIComponent(query)}`;
    const r = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": UA,
        "Referer": "https://www.kavak.com/ar/seminuevos",
        "Origin": "https://www.kavak.com",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];

    const data = await r.json();
    // Kavak puede cambiar la estructura — rutas de fallback
    const cars = data?.data?.cars || data?.cars || data?.results || data?.inventory || data?.data || [];
    if (!Array.isArray(cars)) return [];

    return cars.map(car => {
      const rawPrice = car.price || car.salePrice || car.listPrice || car.totalPrice || 0;
      const isARS = rawPrice > 100000;
      const usd = isARS ? Math.round(rawPrice / blueRate) : rawPrice;
      const ars = isARS ? rawPrice : Math.round(rawPrice * blueRate);
      const imgUrl = car.mainImage?.url || car.images?.[0]?.url || car.images?.[0] || car.image || car.photo || "";
      const slug = car.slug || car.id || car.stockId || "";
      return {
        id: `kavak_${car.id || car.stockId || slug}`,
        title: [car.year, car.brand, car.model, car.version].filter(Boolean).join(" "),
        price_usd: usd,
        price_ars: ars,
        currency_original: isARS ? "ARS" : "USD",
        price_original: rawPrice,
        thumbnail: imgUrl,
        permalink: `https://www.kavak.com/ar/${slug}`,
        location: car.hubName || car.city || car.location || "Argentina",
        km: car.mileage || car.km || car.kilometers || car.odometer || null,
        year: car.year ? parseInt(car.year) : null,
        brand: car.brand || "",
        model: car.model || "",
        condition: "usado",
        source: "kavak",
      };
    }).filter(item => item.price_usd > 0 && item.title.length > 3);
  } catch {
    return [];
  }
}

// ── Scoring inteligente ────────────────────────────────────────────────────

function calcScore(car, avgUsd) {
  let score = 50;

  if (avgUsd && car.price_usd) {
    const ratio = car.price_usd / avgUsd;
    if (ratio < 0.75) score += 35;
    else if (ratio < 0.85) score += 25;
    else if (ratio < 0.92) score += 15;
    else if (ratio > 1.3) score -= 25;
    else if (ratio > 1.2) score -= 15;
    else if (ratio > 1.1) score -= 5;
  }

  if (car.year) {
    const age = CURRENT_YEAR - car.year;
    if (age <= 1) score += 20;
    else if (age <= 3) score += 15;
    else if (age <= 5) score += 10;
    else if (age <= 8) score += 5;
    else if (age > 15) score -= 10;
  }

  if (car.km !== null && car.km !== undefined) {
    if (car.km < 20000) score += 20;
    else if (car.km < 50000) score += 12;
    else if (car.km < 80000) score += 6;
    else if (car.km > 150000) score -= 15;
    else if (car.km > 200000) score -= 25;
  }

  if (car.thumbnail) score += 5;
  if (car.location) score += 3;
  if (car.year && car.km !== null) score += 5;
  if (car.source === "kavak") score += 8; // autos certificados

  return Math.max(0, Math.min(100, score));
}

// ── Deduplicación ─────────────────────────────────────────────────────────

function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    const priceRounded = Math.round(r.price_usd / 500) * 500;
    const kmRounded = r.km ? Math.round(r.km / 5000) * 5000 : "x";
    const key = `${priceRounded}_${r.year || "x"}_${kmRounded}_${(r.brand || "").toLowerCase().slice(0, 4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Filtros backend ────────────────────────────────────────────────────────

function applyBackendFilters(results, params) {
  const { brand, year_from, year_to, price_min_usd, price_max_usd, km_max, sort } = params;

  let filtered = results.filter(r => {
    if (brand) {
      const haystack = `${r.title} ${r.brand || ""}`.toLowerCase();
      if (!haystack.includes(brand.toLowerCase())) return false;
    }
    if (r.year) {
      if (r.year < year_from || r.year > year_to) return false;
    }
    if (r.price_usd < price_min_usd || r.price_usd > price_max_usd) return false;
    if (km_max > 0 && r.km !== null && r.km !== undefined && r.km > km_max) return false;
    return true;
  });

  if (sort === "year_desc") filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
  else if (sort === "year_asc") filtered.sort((a, b) => (a.year || 0) - (b.year || 0));
  else if (sort === "km_asc") filtered.sort((a, b) => (a.km || 999999) - (b.km || 999999));
  else if (sort === "km_desc") filtered.sort((a, b) => (b.km || 0) - (a.km || 0));

  return filtered;
}

// ── Stats ─────────────────────────────────────────────────────────────────

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

// ── Claude AI ─────────────────────────────────────────────────────────────

async function analyzeWithClaude(query, stats, results, apiKey) {
  if (!apiKey || apiKey === "your_key_here") return null;

  const top5 = results.slice(0, 5).map(r =>
    `- ${r.title} | USD ${r.price_usd.toLocaleString()} | ${r.km ? r.km.toLocaleString() + " km" : "km n/d"} | ${r.year || "año n/d"} | ${r.location || "n/d"}`
  ).join("\n");

  const sources = [...new Set(results.map(r => r.source))].join(" y ");

  const prompt = `Sos un experto en el mercado de autos usados de Argentina. Analizá estos resultados de "${query}" (fuentes: ${sources}):\n\nEstadísticas:\n- ${stats.count} autos encontrados\n- Promedio: USD ${stats.avg_usd.toLocaleString()}\n- Mediana: USD ${stats.median_usd.toLocaleString()}\n- Rango: USD ${stats.min_usd.toLocaleString()} – USD ${stats.max_usd.toLocaleString()}\n\nTop anuncios:\n${top5}\n\nEn 3-4 oraciones directas (español argentino): ¿Está caro o barato el mercado? ¿Cuál es el precio justo? ¿Qué hay que tener en cuenta al comprar?`;

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

// ── Handler principal ──────────────────────────────────────────────────────

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return new Response(JSON.stringify({ error: "Búsqueda muy corta" }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const condition = url.searchParams.get("condition") || "";
  const brand = url.searchParams.get("brand") || "";
  const year_from = parseInt(url.searchParams.get("year_from")) || 0;
  const year_to = parseInt(url.searchParams.get("year_to")) || 9999;
  const price_min_usd = parseInt(url.searchParams.get("price_min_usd")) || 0;
  const price_max_usd = parseInt(url.searchParams.get("price_max_usd")) || 999999;
  const km_max = parseInt(url.searchParams.get("km_max")) || 0;
  const sort = url.searchParams.get("sort") || "price_asc";

  const filterParams = { condition, brand, year_from, year_to, price_min_usd, price_max_usd, km_max, sort };

  const cacheKey = new Request(
    `https://cache.autoradar.com.ar/v3/search?q=${encodeURIComponent(q.toLowerCase())}&c=${condition}&b=${encodeURIComponent(brand)}&yf=${year_from}&yt=${year_to}&pmin=${price_min_usd}&pmax=${price_max_usd}&km=${km_max}&s=${sort}`
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const blueRate = await getBlueRate();

    // 4 páginas ML + Kavak en paralelo: máxima cobertura, mínima latencia
    const [p0, p1, p2, p3, kavak] = await Promise.allSettled([
      fetchMLPage(q, blueRate, filterParams, 0),
      fetchMLPage(q, blueRate, filterParams, 50),
      fetchMLPage(q, blueRate, filterParams, 100),
      fetchMLPage(q, blueRate, filterParams, 150),
      fetchKavak(q, blueRate),
    ]);

    const rawAll = [
      ...(p0.status === "fulfilled" ? p0.value : []),
      ...(p1.status === "fulfilled" ? p1.value : []),
      ...(p2.status === "fulfilled" ? p2.value : []),
      ...(p3.status === "fulfilled" ? p3.value : []),
      ...(kavak.status === "fulfilled" ? kavak.value : []),
    ];

    const deduped = deduplicateResults(rawAll);
    const results = applyBackendFilters(deduped, filterParams);

    if (!results.length) {
      return new Response(
        JSON.stringify({ results: [], stats: null, analysis: null, blue_rate: blueRate }),
        { headers: corsHeaders() }
      );
    }

    const stats = calcStats(results);
    const scored = results.map(r => ({ ...r, score: calcScore(r, stats.avg_usd) }));
    const analysis = await analyzeWithClaude(q, stats, scored, context.env?.ANTHROPIC_API_KEY);

    const mlCount = [p0, p1, p2, p3].reduce((s, p) => s + (p.status === "fulfilled" ? p.value.length : 0), 0);
    const kavakCount = kavak.status === "fulfilled" ? kavak.value.length : 0;

    const response = new Response(
      JSON.stringify({
        results: scored,
        stats,
        analysis,
        blue_rate: blueRate,
        query: q,
        sources: { ml: mlCount, kavak: kavakCount },
      }),
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
