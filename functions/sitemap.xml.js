/**
 * Cloudflare Pages Function: /sitemap.xml
 * Genera sitemap dinámico con homepage + todas las páginas SEO de modelos.
 */

const BASE_URL = "https://autoradar.com.ar";

const SEO_MODELS = [
  // Toyota
  "toyota-corolla", "toyota-hilux", "toyota-etios", "toyota-yaris", "toyota-sw4", "toyota-rav4",
  // Ford
  "ford-ranger", "ford-focus", "ford-fiesta", "ford-ecosport", "ford-transit", "ford-kuga",
  // Volkswagen
  "volkswagen-gol-trend", "volkswagen-amarok", "volkswagen-golf", "volkswagen-polo",
  "volkswagen-vento", "volkswagen-tiguan",
  // Chevrolet
  "chevrolet-onix", "chevrolet-cruze", "chevrolet-tracker", "chevrolet-spin", "chevrolet-captiva",
  // Honda
  "honda-civic", "honda-hr-v", "honda-fit", "honda-cr-v", "honda-city",
  // Renault
  "renault-duster", "renault-sandero", "renault-kwid", "renault-logan", "renault-koleos",
  // Peugeot
  "peugeot-208", "peugeot-308", "peugeot-3008", "peugeot-2008",
  // Fiat
  "fiat-cronos", "fiat-pulse", "fiat-toro", "fiat-palio",
  // Nissan
  "nissan-frontier", "nissan-kicks", "nissan-march",
  // Jeep
  "jeep-renegade", "jeep-compass", "jeep-cherokee",
  // Otros
  "hyundai-tucson", "kia-sportage", "mercedes-benz-clase-c", "bmw-serie-3",
];

function urlEntry(path, changefreq = "daily", priority = "0.8", lastmod) {
  const today = lastmod || new Date().toISOString().split("T")[0];
  return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function onRequestGet() {
  const today = new Date().toISOString().split("T")[0];

  const urls = [
    urlEntry("/", "daily", "1.0", today),
    ...SEO_MODELS.map(slug => urlEntry(`/autos/${slug}`, "daily", "0.8", today)),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml;charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
