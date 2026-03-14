/**
 * Cloudflare Pages Function: /api/inventory
 * Lee el inventario pre-cacheado de KV (10,000+ autos) y aplica filtros server-side.
 * Velocidad: ~50ms (lectura KV) vs ~3s del search en tiempo real.
 *
 * GET /api/inventory?q=corolla&brand=Toyota&year_from=2018&year_to=2023
 *                   &price_min_usd=5000&price_max_usd=20000&condition=used
 *                   &sort=price_asc&page=0&limit=50
 */

function corsHeaders() {
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
  };
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
  const kv = context.env?.CARS_KV;

  if (!kv) {
    // KV no configurado — fallback sin inventario
    return new Response(
      JSON.stringify({ results: [], stats: null, meta: null, error: "KV not configured" }),
      { headers: corsHeaders() }
    );
  }

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const brand = (url.searchParams.get("brand") ?? "").toLowerCase();
  const condition = url.searchParams.get("condition") ?? "";
  const year_from = parseInt(url.searchParams.get("year_from")) || 0;
  const year_to = parseInt(url.searchParams.get("year_to")) || 9999;
  const price_min_usd = parseInt(url.searchParams.get("price_min_usd")) || 0;
  const price_max_usd = parseInt(url.searchParams.get("price_max_usd")) || 999999;
  const km_max = parseInt(url.searchParams.get("km_max")) || 0;
  const sort = url.searchParams.get("sort") || "score_desc";
  const page = parseInt(url.searchParams.get("page")) || 0;
  const limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 100);

  try {
    // Leer inventario desde KV (rápido)
    const [inventoryRaw, metaRaw] = await Promise.all([
      kv.get("inventory"),
      kv.get("inventory_meta"),
    ]);

    if (!inventoryRaw) {
      return new Response(
        JSON.stringify({ results: [], stats: null, meta: null, message: "Inventario aún no sincronizado" }),
        { headers: corsHeaders() }
      );
    }

    const inventory = JSON.parse(inventoryRaw);
    const meta = metaRaw ? JSON.parse(metaRaw) : null;

    // Filtrar
    let filtered = inventory.filter(car => {
      if (q) {
        const haystack = `${car.title} ${car.brand} ${car.model}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (brand && !(car.brand || "").toLowerCase().includes(brand)) return false;
      if (condition === "new" && car.condition !== "0km") return false;
      if (condition === "used" && car.condition !== "usado") return false;
      if (car.year && (car.year < year_from || car.year > year_to)) return false;
      if (car.price_usd < price_min_usd || car.price_usd > price_max_usd) return false;
      if (km_max > 0 && car.km !== null && car.km > km_max) return false;
      return true;
    });

    // Sort
    if (sort === "price_asc") filtered.sort((a, b) => a.price_usd - b.price_usd);
    else if (sort === "price_desc") filtered.sort((a, b) => b.price_usd - a.price_usd);
    else if (sort === "year_desc") filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort === "year_asc") filtered.sort((a, b) => (a.year || 0) - (b.year || 0));
    else if (sort === "km_asc") filtered.sort((a, b) => (a.km || 999999) - (b.km || 999999));
    else if (sort === "km_desc") filtered.sort((a, b) => (b.km || 0) - (a.km || 0));
    else filtered.sort((a, b) => (b.score || 0) - (a.score || 0)); // score_desc por defecto

    const stats = calcStats(filtered);
    const total = filtered.length;
    const offset = page * limit;
    const results = filtered.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        results,
        stats,
        meta: { ...meta, total_filtered: total, page, limit, has_more: offset + limit < total },
        from_cache: true,
      }),
      { headers: corsHeaders() }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, results: [], stats: null }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}
