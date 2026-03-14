/**
 * Cloudflare Pages Function: /autos/[modelo]
 * SSR: renderiza una página SEO completa para cada modelo de auto.
 * URL: /autos/toyota-corolla → busca "toyota corolla" en ML y renderiza con meta tags únicos.
 *
 * Ejemplos:
 *   /autos/toyota-corolla-usados
 *   /autos/ford-ranger-4x4
 *   /autos/chevrolet-onix-2020
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MLA_AUTOS_CATEGORY = "MLA1744";

const BRAND_DISPLAY = {
  toyota: "Toyota", ford: "Ford", volkswagen: "Volkswagen", vw: "Volkswagen",
  chevrolet: "Chevrolet", honda: "Honda", renault: "Renault", peugeot: "Peugeot",
  fiat: "Fiat", nissan: "Nissan", jeep: "Jeep", hyundai: "Hyundai", kia: "Kia",
  bmw: "BMW", mercedes: "Mercedes-Benz", audi: "Audi",
};

function slugToQuery(slug) {
  // toyota-corolla-usados → "toyota corolla"
  return slug
    .replace(/-usados?$/, "")
    .replace(/-0km$/, "")
    .replace(/-argentina$/, "")
    .replace(/-/g, " ")
    .trim();
}

function capitalize(str) {
  return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function getBlueRate() {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue", {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return 1200;
    const d = await r.json();
    return d.venta || 1200;
  } catch {
    return 1200;
  }
}

function fmtUSD(n) {
  return "USD " + Math.round(n).toLocaleString("es-AR");
}

function fmtARS(n) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalizePrice(price, currency, blueRate) {
  if (currency === "USD") return { usd: price, ars: Math.round(price * blueRate) };
  return { usd: Math.round(price / blueRate), ars: price };
}

function extractAttr(attrs, id) {
  const a = (attrs || []).find(x => x.id === id);
  return a ? a.value_name || a.values?.[0]?.name : null;
}

async function fetchTopCars(query, blueRate) {
  try {
    const url = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=12&sort=relevance`;
    // Note: ML doesn't support sort=relevance as param, just omit sort for default relevance
    const url2 = `https://api.mercadolibre.com/sites/MLA/search?category=${MLA_AUTOS_CATEGORY}&q=${encodeURIComponent(query)}&limit=12`;
    const r = await fetch(url2, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return { cars: [], stats: null };

    const data = await r.json();
    const cars = (data.results || []).map(item => {
      const { usd, ars } = normalizePrice(item.price, item.currency_id, blueRate);
      const km = extractAttr(item.attributes, "KILOMETERS");
      const year = extractAttr(item.attributes, "VEHICLE_YEAR");
      return {
        title: item.title,
        price_usd: usd,
        price_ars: ars,
        thumbnail: (item.thumbnail || "").replace("-I.jpg", "-O.jpg"),
        permalink: item.permalink,
        km: km ? parseInt(km.replace(/\D/g, "")) || null : null,
        year: year ? parseInt(year) || null : null,
        condition: item.condition === "new" ? "0km" : "usado",
      };
    }).filter(c => c.price_usd > 0);

    const prices = cars.map(c => c.price_usd).sort((a, b) => a - b);
    const stats = prices.length ? {
      count: data.paging?.total || prices.length,
      avg_usd: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      min_usd: prices[0],
      max_usd: prices[prices.length - 1],
    } : null;

    return { cars, stats };
  } catch {
    return { cars: [], stats: null };
  }
}

function renderCarCard(car) {
  const imgHtml = car.thumbnail
    ? `<img src="${escHtml(car.thumbnail)}" alt="${escHtml(car.title)}" loading="lazy" width="280" height="196" style="width:100%;height:196px;object-fit:cover;">`
    : `<div style="width:100%;height:196px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:3rem;">🚗</div>`;

  const yearBadge = car.year
    ? `<span style="font-size:.82rem;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);border-radius:5px;padding:2px 7px;">${car.year}</span>`
    : "";

  const kmTag = car.km && car.condition !== "0km"
    ? `<span style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;padding:3px 9px;font-size:.76rem;color:#a0a0a0;">${car.km.toLocaleString("es-AR")} km</span>`
    : "";

  const condBadge = car.condition === "0km"
    ? `<span style="position:absolute;top:10px;right:10px;padding:4px 10px;border-radius:6px;font-size:.7rem;font-weight:700;background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.4);">0km</span>`
    : `<span style="position:absolute;top:10px;right:10px;padding:4px 10px;border-radius:6px;font-size:.7rem;font-weight:700;background:rgba(60,60,60,.8);color:#a0a0a0;border:1px solid #2a2a2a;">Usado</span>`;

  return `
<a href="${escHtml(car.permalink)}" target="_blank" rel="noopener" style="background:#111;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;">
  <div style="position:relative;overflow:hidden;">${imgHtml}${condBadge}</div>
  <div style="padding:14px 16px 16px;flex:1;display:flex;flex-direction:column;gap:8px;">
    <div style="display:flex;align-items:center;gap:8px;">${yearBadge}<span style="font-size:.92rem;font-weight:600;color:#f0f0f0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(car.title)}</span></div>
    <div style="font-size:1.4rem;font-weight:800;color:#f59e0b;">${fmtUSD(car.price_usd)}</div>
    <div style="font-size:.82rem;color:#a0a0a0;">${fmtARS(car.price_ars)}</div>
    ${kmTag ? `<div>${kmTag}</div>` : ""}
    <div style="margin-top:auto;padding-top:10px;border-top:1px solid #2a2a2a;text-align:right;"><span style="font-size:.76rem;font-weight:600;color:#a0a0a0;border:1px solid #2a2a2a;border-radius:6px;padding:5px 12px;">Ver en ML →</span></div>
  </div>
</a>`;
}

function renderPage(model, query, displayQuery, cars, stats, blueRate) {
  const titleStr = `${displayQuery} usados en Argentina | AutoRadar`;
  const descStr = `Compará precios de ${displayQuery} en Argentina. ${stats ? `Desde USD ${stats.min_usd?.toLocaleString()} hasta USD ${stats.max_usd?.toLocaleString()} con ${stats.count?.toLocaleString()} publicaciones.` : "Precios en USD y pesos con dólar blue actualizado."}`;

  const statsHtml = stats ? `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
  <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;">
    <div style="font-size:.75rem;color:#a0a0a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Publicaciones</div>
    <div style="font-size:1.15rem;font-weight:700;color:#f59e0b;">${stats.count?.toLocaleString("es-AR")}</div>
  </div>
  <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;">
    <div style="font-size:.75rem;color:#a0a0a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Precio promedio</div>
    <div style="font-size:1.15rem;font-weight:700;color:#f59e0b;">${fmtUSD(stats.avg_usd)}</div>
  </div>
  <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;">
    <div style="font-size:.75rem;color:#a0a0a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Desde</div>
    <div style="font-size:1.15rem;font-weight:700;color:#f59e0b;">${fmtUSD(stats.min_usd)}</div>
  </div>
  <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;">
    <div style="font-size:.75rem;color:#a0a0a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Hasta</div>
    <div style="font-size:1.15rem;font-weight:700;color:#f59e0b;">${fmtUSD(stats.max_usd)}</div>
  </div>
</div>` : "";

  const carsGrid = cars.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">${cars.map(renderCarCard).join("")}</div>`
    : "";

  const jsonLd = cars.length ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${displayQuery} usados en Argentina`,
    "description": descStr,
    "url": `https://autoradar.com.ar/autos/${model}`,
    "numberOfItems": stats?.count || cars.length,
    "itemListElement": cars.slice(0, 10).map((car, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Car",
        "name": car.title,
        "url": car.permalink,
        "offers": { "@type": "Offer", "price": car.price_usd, "priceCurrency": "USD" },
        ...(car.year ? { "vehicleModelDate": String(car.year) } : {}),
        ...(car.km ? { "mileageFromOdometer": { "@type": "QuantitativeValue", "value": car.km, "unitCode": "KMT" } } : {}),
      }
    }))
  }) : "{}";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${escHtml(titleStr)}</title>
  <meta name="description" content="${escHtml(descStr)}"/>
  <meta property="og:title" content="${escHtml(titleStr)}"/>
  <meta property="og:description" content="${escHtml(descStr)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="https://autoradar.com.ar/autos/${escHtml(model)}"/>
  <link rel="canonical" href="https://autoradar.com.ar/autos/${escHtml(model)}"/>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
  <script type="application/ld+json">${jsonLd}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/style.css"/>
  <style>body{background:#0a0a0a;color:#f0f0f0;font-family:'Inter',-apple-system,sans-serif;}</style>
</head>
<body>
  <header class="site-header">
    <a href="/" class="logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="currentColor"/>
        <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      AutoRadar
    </a>
    <form class="header-search-form" action="/" method="get">
      <div class="header-search-box">
        <svg class="header-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" name="q" class="header-search-input" placeholder="Buscar: Toyota Corolla 2020..." value="${escHtml(displayQuery)}"/>
        <button type="submit" class="header-search-btn">Buscar</button>
      </div>
    </form>
    <div class="header-right">
      <div class="dollar-badge">
        <span class="dollar-label">Blue</span>
        <span class="dollar-value" id="dollarValue">$ ${blueRate.toLocaleString("es-AR")}</span>
      </div>
    </div>
  </header>

  <main class="main-content">
    <nav style="font-size:.82rem;color:#606060;margin-bottom:20px;">
      <a href="/" style="color:#a0a0a0;text-decoration:none;">AutoRadar</a>
      <span style="margin:0 6px;">›</span>
      <a href="/autos" style="color:#a0a0a0;text-decoration:none;">Autos</a>
      <span style="margin:0 6px;">›</span>
      <span style="color:#f59e0b;">${escHtml(displayQuery)}</span>
    </nav>

    <h1 style="font-size:1.8rem;font-weight:800;margin-bottom:6px;">${escHtml(displayQuery)} <span style="color:#f59e0b;">usados en Argentina</span></h1>
    <p style="color:#a0a0a0;font-size:.95rem;margin-bottom:24px;">
      Compará precios de ${escHtml(displayQuery)} en MercadoLibre Argentina. Precios en USD y pesos con dólar blue actualizado.
    </p>

    ${statsHtml}
    ${carsGrid}

    <div style="margin-top:40px;padding:24px;background:#111;border:1px solid #2a2a2a;border-radius:12px;">
      <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Ver todos los ${escHtml(displayQuery)} disponibles</h2>
      <p style="color:#a0a0a0;font-size:.9rem;margin-bottom:16px;">
        Encontramos ${stats?.count?.toLocaleString("es-AR") || "varios"} publicaciones de ${escHtml(displayQuery)} en Argentina. Usá los filtros para encontrar el precio más conveniente.
      </p>
      <a href="/?q=${encodeURIComponent(query)}" style="display:inline-block;background:#f59e0b;color:#000;border-radius:8px;padding:10px 24px;font-weight:700;text-decoration:none;font-size:.95rem;">
        Ver búsqueda completa →
      </a>
    </div>
  </main>

  <footer class="site-footer">
    <p>AutoRadar busca en <a href="https://autos.mercadolibre.com.ar" target="_blank" rel="noopener">MercadoLibre Argentina</a>. Precios en tiempo real con dólar blue.</p>
  </footer>

  <script>
    // Actualizar dólar en tiempo real
    fetch('/api/dollar').then(r=>r.json()).then(d=>{
      if(d.venta){document.getElementById('dollarValue').textContent='$ '+d.venta.toLocaleString('es-AR');}
    }).catch(()=>{});
  </script>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const model = context.params.model || "";
  if (!model) {
    return new Response("Not Found", { status: 404 });
  }

  const query = slugToQuery(model);
  if (query.length < 2) {
    return new Response("Not Found", { status: 404 });
  }

  const displayQuery = capitalize(query);

  const cacheKey = new Request(`https://cache.autoradar.com.ar/seo/autos/${model}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fetch dólar y autos en paralelo (precios se recalculan con la tasa real)
  const [br, carData] = await Promise.all([getBlueRate(), fetchTopCars(query, 1200)]);
  const finalCars = carData.cars.map(c => ({
    ...c,
    price_ars: Math.round(c.price_usd * br),
  }));

  const html = renderPage(model, query, displayQuery, finalCars, carData.stats, br);

  const response = new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
