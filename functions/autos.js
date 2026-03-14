/**
 * Cloudflare Pages Function: /autos
 * Página índice SSR de todos los modelos indexados.
 * SEO: lista de modelos con links a /autos/[model]
 */

const MODELS = [
  { slug: "toyota-corolla", name: "Toyota Corolla", category: "Sedán" },
  { slug: "toyota-hilux", name: "Toyota Hilux", category: "Pickup" },
  { slug: "toyota-etios", name: "Toyota Etios", category: "Sedán" },
  { slug: "toyota-yaris", name: "Toyota Yaris", category: "Hatchback" },
  { slug: "toyota-sw4", name: "Toyota SW4", category: "SUV" },
  { slug: "ford-ranger", name: "Ford Ranger", category: "Pickup" },
  { slug: "ford-focus", name: "Ford Focus", category: "Hatchback" },
  { slug: "ford-ecosport", name: "Ford EcoSport", category: "SUV" },
  { slug: "volkswagen-amarok", name: "Volkswagen Amarok", category: "Pickup" },
  { slug: "volkswagen-golf", name: "Volkswagen Golf", category: "Hatchback" },
  { slug: "volkswagen-gol-trend", name: "VW Gol Trend", category: "Hatchback" },
  { slug: "volkswagen-polo", name: "Volkswagen Polo", category: "Hatchback" },
  { slug: "volkswagen-vento", name: "Volkswagen Vento", category: "Sedán" },
  { slug: "volkswagen-tiguan", name: "Volkswagen Tiguan", category: "SUV" },
  { slug: "chevrolet-onix", name: "Chevrolet Onix", category: "Hatchback" },
  { slug: "chevrolet-cruze", name: "Chevrolet Cruze", category: "Sedán" },
  { slug: "chevrolet-tracker", name: "Chevrolet Tracker", category: "SUV" },
  { slug: "chevrolet-s10", name: "Chevrolet S10", category: "Pickup" },
  { slug: "honda-civic", name: "Honda Civic", category: "Sedán" },
  { slug: "honda-hr-v", name: "Honda HR-V", category: "SUV" },
  { slug: "honda-fit", name: "Honda Fit", category: "Hatchback" },
  { slug: "renault-duster", name: "Renault Duster", category: "SUV" },
  { slug: "renault-sandero", name: "Renault Sandero", category: "Hatchback" },
  { slug: "renault-kwid", name: "Renault Kwid", category: "SUV" },
  { slug: "renault-logan", name: "Renault Logan", category: "Sedán" },
  { slug: "peugeot-208", name: "Peugeot 208", category: "Hatchback" },
  { slug: "peugeot-308", name: "Peugeot 308", category: "Hatchback" },
  { slug: "peugeot-3008", name: "Peugeot 3008", category: "SUV" },
  { slug: "fiat-cronos", name: "Fiat Cronos", category: "Sedán" },
  { slug: "fiat-pulse", name: "Fiat Pulse", category: "SUV" },
  { slug: "fiat-toro", name: "Fiat Toro", category: "Pickup" },
  { slug: "nissan-frontier", name: "Nissan Frontier", category: "Pickup" },
  { slug: "nissan-kicks", name: "Nissan Kicks", category: "SUV" },
  { slug: "jeep-renegade", name: "Jeep Renegade", category: "SUV" },
  { slug: "jeep-compass", name: "Jeep Compass", category: "SUV" },
  { slug: "hyundai-tucson", name: "Hyundai Tucson", category: "SUV" },
  { slug: "hyundai-creta", name: "Hyundai Creta", category: "SUV" },
  { slug: "kia-sportage", name: "Kia Sportage", category: "SUV" },
  { slug: "kia-cerato", name: "Kia Cerato", category: "Sedán" },
  { slug: "bmw-serie-3", name: "BMW Serie 3", category: "Premium" },
  { slug: "mercedes-clase-c", name: "Mercedes Clase C", category: "Premium" },
  { slug: "audi-a3", name: "Audi A3", category: "Premium" },
];

const CATEGORIES = ["Todos", "Pickup", "SUV", "Hatchback", "Sedán", "Premium"];

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage() {
  const byCategory = {};
  CATEGORIES.slice(1).forEach(cat => {
    byCategory[cat] = MODELS.filter(m => m.category === cat);
  });

  const categorySections = Object.entries(byCategory).map(([cat, models]) => `
    <section style="margin-bottom:36px;">
      <h2 style="font-size:1.1rem;font-weight:700;color:#a0a0a0;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1a1a1a;">${escHtml(cat)}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
        ${models.map(m => `
          <a href="/autos/${escHtml(m.slug)}" style="background:#111;border:1px solid #1a1a1a;border-radius:10px;padding:14px 16px;text-decoration:none;color:#f0f0f0;display:flex;align-items:center;justify-content:space-between;gap:8px;transition:border-color .15s;" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='#1a1a1a'">
            <span style="font-size:.9rem;font-weight:500;">${escHtml(m.name)}</span>
            <span style="color:#f59e0b;font-size:.85rem;">→</span>
          </a>`).join("")}
      </div>
    </section>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Precios de autos en Argentina por modelo | AutoRadar</title>
  <meta name="description" content="Compará precios de los autos más vendidos en Argentina: Toyota, Ford, Volkswagen, Chevrolet y más. Precios en USD con dólar blue actualizado."/>
  <link rel="canonical" href="https://autoradar.com.ar/autos"/>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/style.css"/>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Precios de autos en Argentina por modelo",
    "url": "https://autoradar.com.ar/autos",
    "description": "Directorio de precios de autos usados y 0km en Argentina",
  })}</script>
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
        <input type="text" name="q" class="header-search-input" placeholder="Buscar: Toyota Corolla 2020..."/>
        <button type="submit" class="header-search-btn">Buscar</button>
      </div>
    </form>
    <div class="header-right">
      <div class="dollar-badge">
        <span class="dollar-label">Blue</span>
        <span class="dollar-value" id="dollarValue">...</span>
      </div>
    </div>
  </header>

  <main class="main-content">
    <nav style="font-size:.82rem;color:#606060;margin-bottom:20px;">
      <a href="/" style="color:#a0a0a0;text-decoration:none;">AutoRadar</a>
      <span style="margin:0 6px;">›</span>
      <span style="color:#f59e0b;">Todos los modelos</span>
    </nav>

    <h1 style="font-size:1.8rem;font-weight:800;margin-bottom:8px;">
      Precios de autos en Argentina
    </h1>
    <p style="color:#a0a0a0;font-size:.95rem;margin-bottom:32px;">
      Elegí un modelo para ver precios actualizados en USD y ARS con dólar blue. Comparamos ${MODELS.length} modelos de las marcas más vendidas.
    </p>

    ${categorySections}

    <div style="margin-top:20px;padding:24px;background:#111;border:1px solid #1a1a1a;border-radius:12px;text-align:center;">
      <h2 style="font-size:1rem;font-weight:700;margin-bottom:8px;">¿No encontrás tu auto?</h2>
      <p style="color:#a0a0a0;font-size:.9rem;margin-bottom:16px;">Buscá cualquier modelo directamente.</p>
      <a href="/" style="display:inline-block;background:#f59e0b;color:#000;border-radius:8px;padding:10px 24px;font-weight:700;text-decoration:none;">
        Buscar en AutoRadar →
      </a>
    </div>
  </main>

  <footer class="site-footer">
    <p>AutoRadar busca en <a href="https://autos.mercadolibre.com.ar" target="_blank" rel="noopener">MercadoLibre Argentina</a>. Precios en tiempo real con dólar blue.</p>
  </footer>

  <script>
    fetch('/api/dollar').then(r=>r.json()).then(d=>{
      if(d.venta){document.getElementById('dollarValue').textContent='$ '+d.venta.toLocaleString('es-AR');}
    }).catch(()=>{});
  </script>
</body>
</html>`;
}

export async function onRequestGet() {
  const html = renderPage();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}
