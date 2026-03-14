#!/usr/bin/env node
/**
 * AutoRadar — Sync de inventario masivo
 * Fetchea 10,000+ autos de MercadoLibre en paralelo y los guarda en Cloudflare KV.
 * Detecta cambios de precio vs inventario anterior.
 *
 * Uso: node scripts/sync-ml.js
 * Env: CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_KV_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CATEGORY = "MLA1744";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// 60 queries × 4 páginas × 50 resultados = 12,000 raw → ~8,000-10,000 únicos tras dedup
const QUERIES = [
  // Toyota
  "Toyota Corolla", "Toyota Hilux", "Toyota Etios", "Toyota Yaris", "Toyota RAV4", "Toyota SW4",
  "Toyota Fortuner", "Toyota Prius", "Toyota Land Cruiser", "Toyota Camry",
  // Ford
  "Ford Ranger", "Ford Focus", "Ford Fiesta", "Ford EcoSport", "Ford Kuga", "Ford Bronco",
  "Ford Mustang", "Ford Territory", "Ford Explorer",
  // Volkswagen
  "Volkswagen Amarok", "Volkswagen Golf", "Volkswagen Gol Trend", "Volkswagen Polo", "Volkswagen Vento", "Volkswagen Tiguan",
  "Volkswagen T-Cross", "Volkswagen Taos", "Volkswagen Passat",
  // Chevrolet
  "Chevrolet Onix", "Chevrolet Cruze", "Chevrolet Tracker", "Chevrolet Spin", "Chevrolet S10",
  "Chevrolet Montana", "Chevrolet Equinox", "Chevrolet Blazer",
  // Honda
  "Honda Civic", "Honda HR-V", "Honda Fit", "Honda CR-V", "Honda City", "Honda WR-V",
  "Honda Accord", "Honda Pilot",
  // Renault
  "Renault Duster", "Renault Sandero", "Renault Kwid", "Renault Logan", "Renault Koleos", "Renault Stepway",
  "Renault Kangoo", "Renault Megane", "Renault Fluence",
  // Peugeot
  "Peugeot 208", "Peugeot 308", "Peugeot 3008", "Peugeot 2008", "Peugeot Partner",
  "Peugeot 408", "Peugeot 5008",
  // Fiat
  "Fiat Cronos", "Fiat Pulse", "Fiat Toro", "Fiat Palio", "Fiat Strada",
  "Fiat Argo", "Fiat Mobi", "Fiat 500",
  // Nissan
  "Nissan Frontier", "Nissan Kicks", "Nissan March", "Nissan X-Trail", "Nissan Versa",
  "Nissan Pathfinder", "Nissan Murano",
  // Jeep
  "Jeep Renegade", "Jeep Compass", "Jeep Grand Cherokee", "Jeep Wrangler",
  // Mitsubishi
  "Mitsubishi L200", "Mitsubishi Outlander", "Mitsubishi ASX", "Mitsubishi Eclipse Cross",
  // Hyundai / Kia
  "Hyundai Tucson", "Hyundai Creta", "Hyundai i30", "Hyundai Elantra",
  "Kia Sportage", "Kia Cerato", "Kia Seltos", "Kia Sorento",
  // Premium
  "BMW Serie 3", "BMW X3", "BMW Serie 5", "BMW X5",
  "Mercedes Clase C", "Mercedes GLA", "Mercedes CLA", "Mercedes GLC",
  "Audi A3", "Audi A4", "Audi Q3", "Audi Q5",
  "Volvo XC40", "Volvo XC60",
  // Citroën / Peugeot extras
  "Citroën C3", "Citroën C4 Cactus", "Citroën Berlingo",
  // Suzuki / Subaru
  "Suzuki Vitara", "Suzuki Swift", "Subaru Forester", "Subaru Impreza",
  // DFSK / GAC / Chery (chinos, muy buscados en AR)
  "DFSK", "GAC GS3", "Chery Tiggo", "Haval H2", "Haval H6",
  "BYD Song", "JAC Motors",
  // Categorías amplias (capturan long tail)
  "pickup 4x4", "SUV automática", "sedan nafta", "auto familiar económico",
  "camioneta doble cabina", "auto 0km", "auto financiado", "auto economico nafta",
  "SUV 7 asientos", "auto nafta manual", "auto diesel argentina",
];

async function getBlueRate() {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue");
    const d = await r.json();
    return d.venta || 1300;
  } catch {
    return 1300;
  }
}

function extractAttr(attrs, id) {
  const a = (attrs || []).find(x => x.id === id);
  return a ? a.value_name || a.values?.[0]?.name : null;
}

async function fetchPage(query, offset, blueRate) {
  const url = `https://api.mercadolibre.com/sites/MLA/search?category=${CATEGORY}&q=${encodeURIComponent(query)}&limit=50&offset=${offset}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).map(item => {
      const pUSD = item.currency_id === "USD" ? item.price : Math.round(item.price / blueRate);
      const pARS = item.currency_id === "ARS" ? item.price : Math.round(item.price * blueRate);
      const km = extractAttr(item.attributes, "KILOMETERS");
      const year = extractAttr(item.attributes, "VEHICLE_YEAR");
      const brand = extractAttr(item.attributes, "BRAND");
      const model = extractAttr(item.attributes, "MODEL");
      return {
        id: item.id,
        title: item.title,
        price_usd: pUSD,
        price_ars: pARS,
        thumbnail: (item.thumbnail || "").replace("-I.jpg", "-O.jpg").replace("-I.webp", "-O.webp"),
        permalink: item.permalink,
        location: item.seller_address
          ? `${item.seller_address.city?.name || ""}, ${item.seller_address.state?.name || ""}`.replace(/^,\s*/, "")
          : "",
        km: km ? parseInt(km.replace(/\D/g, "")) || null : null,
        year: year ? parseInt(year) || null : null,
        brand: brand || "",
        model: model || "",
        condition: item.condition === "new" ? "0km" : "usado",
        source: "mercadolibre",
      };
    }).filter(c => c.price_usd > 500 && c.price_usd < 500000);
  } catch {
    return [];
  }
}

async function fetchQuery(query, blueRate) {
  // 4 páginas en paralelo por query
  const pages = await Promise.allSettled([
    fetchPage(query, 0, blueRate),
    fetchPage(query, 50, blueRate),
    fetchPage(query, 100, blueRate),
    fetchPage(query, 150, blueRate),
  ]);
  return pages.flatMap(p => p.status === "fulfilled" ? p.value : []);
}

async function runBatch(queries, blueRate, batchSize = 15) {
  const all = [];
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    console.log(`  Batch ${Math.floor(i/batchSize)+1}/${Math.ceil(queries.length/batchSize)}: ${batch.map(q => q.split(" ")[0]).join(", ")}...`);
    const results = await Promise.allSettled(batch.map(q => fetchQuery(q, blueRate)));
    results.forEach(r => { if (r.status === "fulfilled") all.push(...r.value); });
    // Pequeña pausa entre batches para no saturar ML
    if (i + batchSize < queries.length) await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

function deduplicate(cars) {
  const seen = new Set();
  return cars.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
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
    const age = 2025 - car.year;
    if (age <= 3) score += 15;
    else if (age <= 5) score += 10;
    else if (age > 15) score -= 10;
  }
  if (car.km !== null) {
    if (car.km < 30000) score += 15;
    else if (car.km < 80000) score += 8;
    else if (car.km > 150000) score -= 15;
  }
  if (car.thumbnail) score += 5;
  return Math.max(0, Math.min(100, score));
}

// ── Cloudflare KV ────────────────────────────────────────────────────────

async function kvRead(key) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${key}`;
  const r = await fetch(url, { headers: { "Authorization": `Bearer ${CF_API_TOKEN}` } });
  if (!r.ok) return null;
  return r.text();
}

async function kvWrite(key, value) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${key}`;
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`KV write failed for "${key}": ${err}`);
  }
  console.log(`  ✓ KV "${key}" written (${(body.length / 1024).toFixed(1)} KB)`);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚗 AutoRadar Inventory Sync — " + new Date().toISOString());

  if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error("❌ Faltan variables: CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN");
    process.exit(1);
  }

  // 1. Obtener blue rate
  console.log("\n1. Obteniendo dólar blue...");
  const blueRate = await getBlueRate();
  console.log(`   Blue rate: $${blueRate}`);

  // 2. Leer inventario anterior (para detectar cambios de precio)
  console.log("\n2. Leyendo inventario anterior desde KV...");
  const prevRaw = await kvRead("inventory");
  const prevMap = {};
  if (prevRaw) {
    try {
      const prev = JSON.parse(prevRaw);
      prev.forEach(c => { prevMap[c.id] = c.price_usd; });
      console.log(`   Anterior: ${prev.length} autos`);
    } catch { console.log("   No hay inventario anterior."); }
  }

  // 3. Fetch masivo
  console.log(`\n3. Fetching ${QUERIES.length} queries × 4 páginas = ~${QUERIES.length * 200} autos raw...`);
  const raw = await runBatch(QUERIES, blueRate, 15);
  console.log(`   Raw: ${raw.length} resultados`);

  // 4. Deduplicar
  const unique = deduplicate(raw);
  console.log(`   Únicos: ${unique.length} autos`);

  // 5. Filtrar y calcular stats
  const valid = unique.filter(c => c.price_usd > 0 && c.title.length > 5);
  const prices = valid.map(c => c.price_usd).sort((a, b) => a - b);
  const avgUsd = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  console.log(`   Precio promedio: USD ${avgUsd.toLocaleString()}`);

  // 6. Detectar cambios de precio + agregar score
  let priceDrop = 0;
  const inventory = valid.map(car => {
    const scored = { ...car, score: calcScore(car, avgUsd) };
    if (prevMap[car.id]) {
      const diff = prevMap[car.id] - car.price_usd;
      if (diff >= 200) {
        scored.price_drop_usd = diff;
        scored.price_drop_pct = Math.round((diff / prevMap[car.id]) * 100);
        priceDrop++;
      }
    }
    return scored;
  });

  console.log(`   Bajadas de precio detectadas: ${priceDrop}`);

  // 7. Guardar en KV
  console.log("\n4. Guardando en Cloudflare KV...");
  await kvWrite("inventory", JSON.stringify(inventory));
  await kvWrite("inventory_meta", JSON.stringify({
    count: inventory.length,
    updated_at: new Date().toISOString(),
    blue_rate: blueRate,
    avg_usd: avgUsd,
    price_drops: priceDrop,
  }));

  console.log(`\n✅ Sync completo: ${inventory.length} autos guardados.`);
  console.log(`   Tamaño: ${(JSON.stringify(inventory).length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
