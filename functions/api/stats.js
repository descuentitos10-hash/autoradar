/**
 * Cloudflare Pages Function: /api/stats
 * Estadísticas del mercado calculadas desde el inventario KV.
 * GET /api/stats → resumen del mercado: conteo por marca, precios por categoría, etc.
 */

function corsHeaders() {
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  };
}

export async function onRequestGet(context) {
  const kv = context.env?.CARS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV not configured" }), { headers: corsHeaders() });
  }

  const [inventoryRaw, metaRaw] = await Promise.all([
    kv.get("inventory"),
    kv.get("inventory_meta"),
  ]);

  if (!inventoryRaw) {
    return new Response(JSON.stringify({ error: "Inventario no disponible" }), { headers: corsHeaders() });
  }

  try {
    const inventory = JSON.parse(inventoryRaw);
    const meta = metaRaw ? JSON.parse(metaRaw) : null;

    // Stats por marca
    const brandMap = {};
    const conditionCount = { "0km": 0, "usado": 0 };
    let totalPriceDrops = 0;
    const priceRanges = { "0-5k": 0, "5k-10k": 0, "10k-20k": 0, "20k-50k": 0, "50k+": 0 };

    inventory.forEach(car => {
      // Marca
      const brand = car.brand || "Otra";
      if (!brandMap[brand]) brandMap[brand] = { count: 0, total_usd: 0 };
      brandMap[brand].count++;
      brandMap[brand].total_usd += car.price_usd;

      // Condición
      if (car.condition === "0km") conditionCount["0km"]++;
      else conditionCount["usado"]++;

      // Bajadas de precio
      if (car.price_drop_usd) totalPriceDrops++;

      // Rangos de precio
      const p = car.price_usd;
      if (p < 5000) priceRanges["0-5k"]++;
      else if (p < 10000) priceRanges["5k-10k"]++;
      else if (p < 20000) priceRanges["10k-20k"]++;
      else if (p < 50000) priceRanges["20k-50k"]++;
      else priceRanges["50k+"]++;
    });

    // Top marcas por cantidad
    const topBrands = Object.entries(brandMap)
      .map(([brand, data]) => ({
        brand,
        count: data.count,
        avg_usd: Math.round(data.total_usd / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return new Response(JSON.stringify({
      total: inventory.length,
      meta,
      condition: conditionCount,
      price_drops: totalPriceDrops,
      price_ranges: priceRanges,
      top_brands: topBrands,
    }), { headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}
