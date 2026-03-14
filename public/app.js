// ── Estado global ─────────────────────────────────────────────────────────────

const state = {
  query: "",
  condition: "",
  brand: "",
  year_from: "",
  year_to: "",
  price_min_usd: "",
  price_max_usd: "",
  km_max: "",
  price_drop_only: false,
  sort: "score_desc",
  results: [],
  rendered: 0,
  stats: null,
  loading: false,
  isFeatured: false,
  hasMore: false,
  inventoryMeta: null,
  compareList: [],
  favorites: loadFavorites(), // persistidos en localStorage
};

// ── Favoritos (localStorage) ──────────────────────────────────────────────────

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem("ar_favorites") || "[]"); } catch { return []; }
}

function saveFavorites() {
  try { localStorage.setItem("ar_favorites", JSON.stringify(state.favorites)); } catch {}
}

function isFavorite(id) {
  return state.favorites.some(f => f.id === id);
}

function toggleFavorite(car) {
  const idx = state.favorites.findIndex(f => f.id === car.id);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
  } else {
    state.favorites.unshift({ ...car, saved_at: Date.now() });
    if (state.favorites.length > 100) state.favorites.pop();
  }
  saveFavorites();
  updateFavBadge();
  // actualizar botones en pantalla
  document.querySelectorAll(`.fav-btn[data-id="${CSS.escape(car.id)}"]`).forEach(btn => {
    btn.classList.toggle("fav-active", isFavorite(car.id));
    btn.title = isFavorite(car.id) ? "Quitar de favoritos" : "Guardar";
  });
}

function updateFavBadge() {
  const count = state.favorites.length;
  const badge = document.getElementById("favBadge");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
}

const PAGE_SIZE = 48; // cards por carga

// ── Historial de búsquedas ────────────────────────────────────────────────────

function loadSearchHistory() {
  try { return JSON.parse(localStorage.getItem("ar_search_history") || "[]"); } catch { return []; }
}

function saveSearchToHistory(q) {
  if (!q || q.length < 2) return;
  try {
    let history = loadSearchHistory();
    history = [q, ...history.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, 10);
    localStorage.setItem("ar_search_history", JSON.stringify(history));
  } catch {}
}

// Autocompletado con marcas/modelos populares
const AUTOCOMPLETE_SUGGESTIONS = [
  "Toyota Corolla", "Toyota Hilux", "Toyota Etios", "Toyota Yaris", "Toyota SW4", "Toyota RAV4",
  "Ford Ranger", "Ford Focus", "Ford EcoSport", "Ford Fiesta",
  "Volkswagen Amarok", "Volkswagen Golf", "Volkswagen Gol Trend", "Volkswagen Polo", "Volkswagen Vento",
  "Chevrolet Onix", "Chevrolet Cruze", "Chevrolet Tracker", "Chevrolet S10",
  "Honda Civic", "Honda HR-V", "Honda Fit", "Honda City",
  "Renault Duster", "Renault Sandero", "Renault Kwid", "Renault Logan",
  "Peugeot 208", "Peugeot 308", "Peugeot 3008", "Peugeot 2008",
  "Fiat Cronos", "Fiat Pulse", "Fiat Toro", "Fiat Strada",
  "Nissan Frontier", "Nissan Kicks", "Nissan March",
  "Jeep Renegade", "Jeep Compass", "Jeep Grand Cherokee",
  "Hyundai Tucson", "Hyundai Creta", "Kia Sportage", "Kia Cerato",
  "BMW Serie 3", "Mercedes Clase C", "Audi A3", "Audi A4",
  "Mitsubishi L200", "Mitsubishi Outlander",
  "pickup 4x4", "SUV automática", "sedán nafta",
];

function getSuggestions(input) {
  if (!input || input.length < 1) return [];
  const q = input.toLowerCase();
  return AUTOCOMPLETE_SUGGESTIONS
    .filter(s => s.toLowerCase().includes(q))
    .slice(0, 6);
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function fmtUSD(n) {
  return "USD " + Math.round(n).toLocaleString("es-AR");
}

function fmtARS(n) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

function fmtKm(n) {
  if (n === null || n === undefined) return null;
  if (n === 0) return "0 km";
  return n.toLocaleString("es-AR") + " km";
}

// ── Dollar Blue ───────────────────────────────────────────────────────────────

async function loadDollar() {
  try {
    const r = await fetch("/api/dollar");
    const data = await r.json();
    const el = document.getElementById("dollarValue");
    if (el && data.venta) {
      el.textContent = "$ " + data.venta.toLocaleString("es-AR");
    }
  } catch {
    const el = document.getElementById("dollarValue");
    if (el) el.textContent = "—";
  }
}

// ── Construir URL con filtros ─────────────────────────────────────────────────

function buildApiUrl(isFeatured) {
  if (isFeatured) return "/api/featured";

  const params = new URLSearchParams();
  params.set("q", state.query);
  if (state.condition) params.set("condition", state.condition);
  if (state.brand) params.set("brand", state.brand);
  if (state.year_from) params.set("year_from", state.year_from);
  if (state.year_to) params.set("year_to", state.year_to);
  if (state.price_min_usd) params.set("price_min_usd", state.price_min_usd);
  if (state.price_max_usd) params.set("price_max_usd", state.price_max_usd);
  if (state.km_max) params.set("km_max", state.km_max);
  if (state.sort) params.set("sort", state.sort);
  return `/api/search?${params.toString()}`;
}

// ── Fetch de datos ────────────────────────────────────────────────────────────

function setPopularChipsVisible(v) {
  document.getElementById("popularSearches")?.classList.toggle("visible", v);
}

function setHeroVisible(v) {
  document.getElementById("heroBanner")?.classList.toggle("visible", v);
}

async function loadHeroStats() {
  try {
    const [statsR, dollarEl] = await Promise.all([
      fetch("/api/stats"),
      Promise.resolve(document.getElementById("dollarValue")?.textContent),
    ]);
    const data = await statsR.json();
    const totalEl = document.getElementById("heroTotal");
    const dropsEl = document.getElementById("heroDrops");
    const blueEl = document.getElementById("heroBlue");
    const heroStats = document.getElementById("heroStats");

    if (data.total && totalEl) {
      totalEl.textContent = data.total.toLocaleString("es-AR");
      if (dropsEl && data.price_drops) dropsEl.textContent = data.price_drops.toLocaleString("es-AR");
      if (blueEl && dollarEl) blueEl.textContent = dollarEl;
      if (heroStats) heroStats.style.display = "flex";
    }
  } catch { /* silently fail */ }
}

async function loadFeatured() {
  state.loading = true;
  state.isFeatured = true;
  state.compareList = [];
  updateCompareBar();
  setPopularChipsVisible(true);
  setHeroVisible(true);
  loadHeroStats();

  renderSkeletons(24);
  showStats(null);
  updateResultsMeta(null, true);

  try {
    // Intentar primero el inventario KV (10k autos, rápido)
    const invParams = new URLSearchParams({ sort: "score_desc", limit: "160" });
    if (state.condition) invParams.set("condition", state.condition === "new" ? "new" : "used");
    if (state.brand) invParams.set("brand", state.brand);
    if (state.year_from) invParams.set("year_from", state.year_from);
    if (state.year_to) invParams.set("year_to", state.year_to);
    if (state.price_min_usd) invParams.set("price_min_usd", state.price_min_usd);
    if (state.price_max_usd) invParams.set("price_max_usd", state.price_max_usd);
    if (state.km_max) invParams.set("km_max", state.km_max);
    if (state.price_drop_only) invParams.set("price_drop_only", "1");
    const invR = await fetch(`/api/inventory?${invParams.toString()}`);
    const invData = await invR.json();

    if (invData.results && invData.results.length > 0) {
      state.results = invData.results;
      state.stats = invData.stats;
      state.inventoryMeta = invData.meta;
      state.rendered = 0;
      renderResults({ results: state.results.slice(0, PAGE_SIZE), stats: invData.stats });
      state.rendered = Math.min(PAGE_SIZE, state.results.length);
      state.hasMore = state.results.length > PAGE_SIZE;
      const totalCount = invData.meta?.count || invData.results.length;
      updateResultsMeta(totalCount, true);
      showStats(invData.stats);
      // Mostrar contador en header
      const invCountEl = document.getElementById("inventoryCount");
      if (invCountEl && totalCount > 100) {
        invCountEl.textContent = `${totalCount.toLocaleString("es-AR")} autos`;
        invCountEl.style.display = "inline";
      }
      updateScrollSentinel();

      // Mostrar oportunidades del día: autos con score alto y precio < 85% avg
      const opEl = document.getElementById("oportunidades");
      const opGrid = document.getElementById("oportunidadesGrid");
      if (opEl && opGrid && invData.stats?.avg_usd) {
        const avg = invData.stats.avg_usd;
        const deals = invData.results
          .filter(c => c.price_usd < avg * 0.82 && c.thumbnail && c.price_usd > 1000)
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 6);
        if (deals.length >= 3) {
          opGrid.innerHTML = "";
          deals.forEach(car => opGrid.appendChild(buildCarCard(car, invData.stats?.avg_usd)));
          opEl.style.display = "block";
        }
      }

      return;
    }
  } catch { /* fallback */ }

  // Fallback a /api/featured
  try {
    const r = await fetch("/api/featured");
    const data = await r.json();
    if (data.error) { showFetchError(data.error); return; }
    state.results = data.results || [];
    state.stats = data.stats;
    state.rendered = 0;
    renderResults({ results: state.results.slice(0, PAGE_SIZE), stats: data.stats });
    state.rendered = Math.min(PAGE_SIZE, state.results.length);
    state.hasMore = state.results.length > PAGE_SIZE;
    updateResultsMeta(data.results?.length || 0, true);
    showStats(data.stats);
    updateScrollSentinel();
  } catch (err) {
    showFetchError("Error al cargar el feed.");
  } finally {
    state.loading = false;
  }
}

async function doSearch() {
  const q = state.query.trim();
  if (!q) {
    loadFeatured();
    return;
  }

  state.loading = true;
  state.isFeatured = false;
  setPopularChipsVisible(false);
  setHeroVisible(false);
  const opEl = document.getElementById("oportunidades");
  if (opEl) opEl.style.display = "none";

  // Actualizar URL
  const url = new URL(window.location);
  url.searchParams.set("q", q);
  if (state.condition) url.searchParams.set("condition", state.condition); else url.searchParams.delete("condition");
  if (state.brand) url.searchParams.set("brand", state.brand); else url.searchParams.delete("brand");
  if (state.year_from) url.searchParams.set("year_from", state.year_from); else url.searchParams.delete("year_from");
  if (state.year_to) url.searchParams.set("year_to", state.year_to); else url.searchParams.delete("year_to");
  if (state.price_min_usd) url.searchParams.set("price_min_usd", state.price_min_usd); else url.searchParams.delete("price_min_usd");
  if (state.price_max_usd) url.searchParams.set("price_max_usd", state.price_max_usd); else url.searchParams.delete("price_max_usd");
  url.searchParams.set("sort", state.sort);
  window.history.pushState({}, "", url);

  // SEO dinámico
  updateSEO(q);

  renderSkeletons(12);
  showStats(null);
  updateResultsMeta(null, false, q);
  hideAnalysis();
  hideYearBreakdown();
  const relEl = document.getElementById("relatedModels");
  if (relEl) relEl.style.display = "none";

  try {
    const r = await fetch(buildApiUrl(false));
    const data = await r.json();
    if (data.error && !data.results) {
      showFetchError(data.error);
      return;
    }
    const allResults = data.results || [];
    state.results = allResults;
    state.stats = data.stats;
    state.rendered = 0;
    renderResults({ results: allResults.slice(0, PAGE_SIZE), stats: data.stats });
    state.rendered = Math.min(PAGE_SIZE, allResults.length);
    state.hasMore = allResults.length > PAGE_SIZE;
    updateResultsMeta(allResults.length, false, q, data.sources);
    showStats(data.stats);
    updateScrollSentinel();
    showYearBreakdown(allResults);
    showRelatedModels(q);
    if (data.analysis) showAnalysis(data.analysis);
  } catch (err) {
    showFetchError("Error al conectar con el servidor.");
  } finally {
    state.loading = false;
  }
}

// ── Infinite scroll ───────────────────────────────────────────────────────────

let scrollObserver = null;

function updateScrollSentinel() {
  const sentinel = document.getElementById("scrollSentinel");
  if (!sentinel) return;
  sentinel.style.display = state.hasMore ? "block" : "none";
}

function loadMoreCards() {
  if (state.loading || !state.hasMore) return;
  const next = state.results.slice(state.rendered, state.rendered + PAGE_SIZE);
  if (!next.length) { state.hasMore = false; updateScrollSentinel(); return; }

  const grid = document.getElementById("carsGrid");
  next.forEach(car => {
    const card = buildCarCard(car, state.stats?.avg_usd);
    grid.appendChild(card);
  });
  state.rendered += next.length;
  state.hasMore = state.rendered < state.results.length;
  updateScrollSentinel();
}

function initScrollObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  const sentinel = document.getElementById("scrollSentinel");
  if (!sentinel) return;
  scrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadMoreCards();
  }, { rootMargin: "400px" });
  scrollObserver.observe(sentinel);
}

// ── Comparador ────────────────────────────────────────────────────────────────

function toggleCompare(car) {
  const idx = state.compareList.findIndex(c => c.id === car.id);
  if (idx >= 0) {
    state.compareList.splice(idx, 1);
  } else {
    if (state.compareList.length >= 3) {
      state.compareList.shift(); // remove oldest
    }
    state.compareList.push(car);
  }
  updateCompareBar();
  // Re-render compare buttons en cards visibles
  document.querySelectorAll(".car-compare-btn").forEach(btn => {
    const id = btn.dataset.id;
    const inList = state.compareList.some(c => c.id === id);
    btn.classList.toggle("compare-active", inList);
    btn.title = inList ? "Quitar del comparador" : "Agregar al comparador";
  });
}

function updateCompareBar() {
  const bar = document.getElementById("compareBar");
  const count = state.compareList.length;
  if (!bar) return;
  if (count < 2) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  document.getElementById("compareCount").textContent = count;
  const thumbs = document.getElementById("compareThumbs");
  thumbs.innerHTML = state.compareList.map(c =>
    c.thumbnail
      ? `<img src="${escHtml(c.thumbnail)}" alt="${escHtml(c.title)}" class="compare-thumb">`
      : `<div class="compare-thumb compare-thumb-placeholder">🚗</div>`
  ).join("");
}

function openComparador() {
  const cars = state.compareList;
  if (cars.length < 2) return;

  const minPrice = Math.min(...cars.map(c => c.price_usd));
  const maxKm = Math.max(...cars.map(c => c.km || 0));
  const maxYear = Math.max(...cars.map(c => c.year || 0));
  const maxScore = Math.max(...cars.map(c => c.score || 0));

  const fields = [
    {
      label: "Precio USD",
      fn: c => {
        const isMin = c.price_usd === minPrice;
        return `<strong style="color:${isMin ? "var(--green)" : "var(--accent)"};font-size:1.05rem;">${fmtUSD(c.price_usd)}</strong>${isMin ? ' <span style="font-size:.65rem;background:rgba(16,185,129,.15);color:var(--green);border-radius:4px;padding:1px 5px;">más barato</span>' : ""}`;
      }
    },
    { label: "Precio ARS", fn: c => `<span style="color:var(--text2);font-size:.88rem;">${fmtARS(c.price_ars)}</span>` },
    {
      label: "Año",
      fn: c => {
        const isMax = c.year && c.year === maxYear;
        return c.year ? `<span style="font-weight:700;color:${isMax ? "var(--green)" : "var(--text)"};">${c.year}</span>` : "—";
      }
    },
    {
      label: "Kilómetros",
      fn: c => {
        const isMin = c.km !== null && c.km !== undefined && c.km <= cars.filter(x => x.km !== null).reduce((m, x) => Math.min(m, x.km), Infinity);
        return c.km ? `<span style="color:${isMin ? "var(--green)" : "var(--text)"};">${c.km.toLocaleString("es-AR")} km</span>` : "—";
      }
    },
    { label: "Condición", fn: c => `<span style="background:${c.condition==="0km"?"rgba(16,185,129,.15)":"var(--bg3)"};color:${c.condition==="0km"?"var(--green)":"var(--text2)"};border-radius:5px;padding:2px 8px;font-size:.8rem;">${c.condition}</span>` },
    { label: "Ubicación", fn: c => `<span style="font-size:.82rem;color:var(--text2);">${c.location || "—"}</span>` },
    { label: "Fuente", fn: c => c.source === "kavak" ? `<span style="color:#3b82f6;font-weight:600;">Kavak</span>` : `<span style="color:#f59e0b;font-weight:600;">MercadoLibre</span>` },
    {
      label: "Puntuación",
      fn: c => {
        const s = c.score || 0;
        const isMax = s === maxScore;
        const color = s >= 85 ? "var(--green)" : s >= 70 ? "var(--accent)" : "var(--text2)";
        return `<span style="font-weight:700;color:${isMax ? "var(--green)" : color};font-size:1.1rem;">${s}</span><span style="font-size:.7rem;color:var(--text3);">/100</span>`;
      }
    },
    { label: "Bajó precio", fn: c => c.price_drop_usd ? `<span style="color:var(--green);font-weight:600;">↓ USD ${Math.round(c.price_drop_usd).toLocaleString("es-AR")}</span>` : `<span style="color:var(--text3);">—</span>` },
  ];

  const colStyle = `flex:1;padding:14px;text-align:center;border-left:1px solid var(--border);`;
  const headerRow = `<div style="display:flex;border-bottom:1px solid var(--border);">
    <div style="width:120px;padding:14px;font-size:.8rem;color:var(--text3);font-weight:600;flex-shrink:0;"></div>
    ${cars.map(c => `<div style="${colStyle}">
      ${c.thumbnail ? `<img src="${escHtml(c.thumbnail)}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px;">` : `<div style="width:100%;height:100px;background:var(--bg3);border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;font-size:2rem;">🚗</div>`}
      <div style="font-size:.83rem;font-weight:600;color:var(--text);line-height:1.3;">${escHtml(c.title)}</div>
    </div>`).join("")}
  </div>`;

  const rows = fields.map(field => `
    <div style="display:flex;border-bottom:1px solid var(--border);">
      <div style="width:120px;padding:12px 14px;font-size:.78rem;color:var(--text2);flex-shrink:0;display:flex;align-items:center;">${field.label}</div>
      ${cars.map(c => `<div style="${colStyle}font-size:.88rem;color:var(--text);display:flex;align-items:center;justify-content:center;">${field.fn(c)}</div>`).join("")}
    </div>`).join("");

  const links = `<div style="display:flex;border-top:1px solid var(--border);">
    <div style="width:120px;flex-shrink:0;"></div>
    ${cars.map(c => `<div style="${colStyle}"><a href="${escHtml(c.permalink)}" target="_blank" rel="noopener" style="display:inline-block;background:var(--accent);color:#000;border-radius:8px;padding:8px 16px;font-weight:700;font-size:.83rem;text-decoration:none;">Ver anuncio →</a></div>`).join("")}
  </div>`;

  const modal = document.getElementById("comparadorModal");
  const body = document.getElementById("comparadorBody");
  body.innerHTML = headerRow + rows + links;
  modal.style.display = "flex";
}

// ── Re-ejecutar según estado actual ──────────────────────────────────────────

function applyFilters() {
  if (state.query.trim()) {
    doSearch();
  } else {
    loadFeatured();
  }
}

// ── Render skeletons ──────────────────────────────────────────────────────────

function renderSkeletons(n) {
  const grid = document.getElementById("carsGrid");
  document.getElementById("noResults").style.display = "none";
  grid.innerHTML = Array.from({ length: n }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-title-2"></div>
        <div class="skeleton skeleton-price"></div>
        <div class="skeleton skeleton-ars"></div>
        <div class="skeleton skeleton-meta"></div>
        <div class="skeleton skeleton-loc"></div>
      </div>
    </div>
  `).join("");
}

// ── Render de resultados ──────────────────────────────────────────────────────

function renderResults(data) {
  const { results = [], stats } = data;
  const grid = document.getElementById("carsGrid");

  if (!results.length) {
    grid.innerHTML = "";
    document.getElementById("noResults").style.display = "flex";
    return;
  }

  document.getElementById("noResults").style.display = "none";
  const avgUsd = stats?.avg_usd;

  grid.innerHTML = "";
  results.forEach(car => {
    const card = buildCarCard(car, avgUsd);
    grid.appendChild(card);
  });
}

function buildCarCard(car, avgUsd) {
  const a = document.createElement("a");
  a.className = "car-card";
  a.href = car.permalink;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const km = fmtKm(car.km);
  const isNew = car.condition === "0km";

  // Badge precio vs mercado
  let priceBadgeHtml = "";
  if (avgUsd && car.price_usd) {
    if (car.price_usd < avgUsd * 0.85) {
      priceBadgeHtml = `<span class="car-badge badge-oferta">🔥 Oferta</span>`;
    } else if (car.price_usd < avgUsd * 0.92) {
      priceBadgeHtml = `<span class="car-badge badge-justo">Precio justo</span>`;
    } else if (car.price_usd > avgUsd * 1.2) {
      priceBadgeHtml = `<span class="car-badge badge-caro">Caro</span>`;
    }
  }

  // Badge bajada de precio
  const priceDrop = car.price_drop_usd;
  const priceDropHtml = priceDrop
    ? `<span class="price-drop-badge">↓ USD ${Math.round(priceDrop).toLocaleString("es-AR")} menos</span>`
    : "";

  // Badge condición
  const conditionBadgeHtml = isNew
    ? `<span class="badge-condition badge-new">0km</span>`
    : `<span class="badge-condition badge-used">Usado</span>`;

  // Badge fuente
  const source = car.source || "mercadolibre";
  const sourceBadgeHtml = source === "kavak"
    ? `<span class="source-badge source-kavak">Kavak</span>`
    : `<span class="source-badge source-ml">ML</span>`;

  // Imagen
  const imgHtml = car.thumbnail
    ? `<img class="car-image" src="${escHtml(car.thumbnail)}" alt="${escHtml(car.title)}" loading="lazy"
         onerror="this.parentNode.innerHTML='<div class=\\'car-image-placeholder\\'>${isNew ? "🚙" : "🚗"}</div>'" />`
    : `<div class="car-image-placeholder">${isNew ? "🚙" : "🚗"}</div>`;

  // Año
  const yearHtml = car.year
    ? `<span class="car-year">${car.year}</span>`
    : "";

  // Km tag
  const kmTagHtml = km && !isNew
    ? `<span class="car-tag">${km}</span>`
    : "";

  // CTA según fuente
  const ctaLabel = source === "kavak" ? "Ver en Kavak →" : "Ver en ML →";

  // Share button (Web Share API o clipboard fallback)
  const shareBtnHtml = `<button class="car-share-btn" data-id="${escHtml(car.id)}" title="Compartir" aria-label="Compartir">⬆</button>`;

  // Barra de precio vs mercado
  let priceBarHtml = "";
  if (avgUsd && car.price_usd) {
    const ratio = car.price_usd / avgUsd;
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 50))); // 50% = avg
    const barColor = ratio < 0.85 ? "var(--green)" : ratio > 1.2 ? "var(--red)" : "var(--accent)";
    const barLabel = ratio < 0.85 ? `${Math.round((1-ratio)*100)}% bajo promedio` : ratio > 1.2 ? `${Math.round((ratio-1)*100)}% sobre promedio` : "Precio de mercado";
    priceBarHtml = `<div class="price-bar-wrap" title="${barLabel}"><div class="price-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>`;
  }

  // Localización
  const locationHtml = car.location
    ? `<span class="car-location" title="${escHtml(car.location)}">📍 ${escHtml(car.location)}</span>`
    : `<span class="car-location"></span>`;

  // Score badge (solo si >70)
  const score = car.score || 0;
  const scoreBadgeHtml = score >= 75
    ? `<span class="score-badge score-${score >= 85 ? "high" : "med"}">${score}</span>`
    : "";

  // Botón favorito
  const faved = isFavorite(car.id);
  const favBtnHtml = `<button class="fav-btn${faved ? " fav-active" : ""}" data-id="${escHtml(car.id)}" title="${faved ? "Quitar de favoritos" : "Guardar"}" aria-label="Favorito">♥</button>`;

  // Botón comparar
  const inCompare = state.compareList.some(c => c.id === car.id);
  const compareBtnHtml = `<button class="car-compare-btn${inCompare ? " compare-active" : ""}" data-id="${escHtml(car.id)}" title="${inCompare ? "Quitar del comparador" : "Agregar al comparador"}" aria-label="Comparar">⊕</button>`;

  a.innerHTML = `
    <div class="car-image-wrap">
      ${imgHtml}
      ${priceBadgeHtml}
      ${conditionBadgeHtml}
      ${compareBtnHtml}
      ${favBtnHtml}
    </div>
    <div class="car-body">
      ${scoreBadgeHtml}
      <div class="car-year-title">
        ${yearHtml}
        <div class="car-title">${escHtml(car.title)}</div>
      </div>
      <div class="car-price-usd">${fmtUSD(car.price_usd)}</div>
      ${priceBarHtml}
      <div class="car-price-ars">${fmtARS(car.price_ars)}${priceDropHtml}</div>
      ${kmTagHtml ? `<div class="car-meta">${kmTagHtml}${sourceBadgeHtml}</div>` : `<div class="car-meta">${sourceBadgeHtml}</div>`}
      <div class="car-footer">
        ${locationHtml}
        <div style="display:flex;align-items:center;gap:6px;">
          ${shareBtnHtml}
          <span class="car-cta-btn">${ctaLabel}</span>
        </div>
      </div>
    </div>
  `;

  // Event: comparar
  a.querySelector(".car-compare-btn")?.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    toggleCompare(car);
  });

  // Event: favorito
  a.querySelector(".fav-btn")?.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    toggleFavorite(car);
  });

  // Track click (recently viewed)
  a.addEventListener("click", () => {
    try {
      const recentRaw = localStorage.getItem("ar_recent") || "[]";
      const recent = JSON.parse(recentRaw);
      const entry = { id: car.id, title: car.title, price_usd: car.price_usd, thumbnail: car.thumbnail, permalink: car.permalink, viewed_at: Date.now() };
      const filtered = recent.filter(r => r.id !== car.id);
      filtered.unshift(entry);
      localStorage.setItem("ar_recent", JSON.stringify(filtered.slice(0, 20)));
    } catch {}
  });

  // Event: share
  a.querySelector(".car-share-btn")?.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    const shareData = {
      title: car.title,
      text: `${car.title} — ${fmtUSD(car.price_usd)} en AutoRadar`,
      url: car.permalink,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${shareData.text}\n${shareData.url}`).then(() => {
        const btn = e.currentTarget;
        btn.textContent = "✓";
        setTimeout(() => { btn.textContent = "⬆"; }, 1500);
      });
    }
  });

  return a;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Favoritos: página modal ────────────────────────────────────────────────────

function showFavoritesPage() {
  const modal = document.getElementById("favModal");
  if (!modal) return;
  const body = document.getElementById("favModalBody");
  if (!body) return;

  if (!state.favorites.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text2);">
        <div style="font-size:3rem;margin-bottom:16px;">♥</div>
        <p style="font-size:1.1rem;font-weight:600;margin-bottom:8px;">Sin favoritos guardados</p>
        <p style="font-size:0.9rem;">Tocá el ♥ en cualquier auto para guardarlo acá.</p>
      </div>`;
    modal.style.display = "flex";
    return;
  }

  const avg = state.favorites.length
    ? Math.round(state.favorites.reduce((s, c) => s + c.price_usd, 0) / state.favorites.length)
    : 0;

  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      <span style="color:var(--text2);font-size:0.9rem;">${state.favorites.length} guardado${state.favorites.length !== 1 ? "s" : ""} · Promedio ${fmtUSD(avg)}</span>
      <button id="clearFavsBtn" style="background:none;border:1px solid var(--border);color:var(--red);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.85rem;">Limpiar todo</button>
    </div>
    <div class="cars-grid" id="favGrid"></div>
  `;

  const grid = document.getElementById("favGrid");
  state.favorites.forEach(car => {
    grid.appendChild(buildCarCard(car, avg));
  });

  document.getElementById("clearFavsBtn")?.addEventListener("click", () => {
    state.favorites = [];
    saveFavorites();
    updateFavBadge();
    showFavoritesPage();
  });

  modal.style.display = "flex";
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function showStats(stats) {
  const bar = document.getElementById("statsBar");
  if (!stats) {
    bar.style.display = "none";
    return;
  }
  document.getElementById("statCount").textContent = stats.count.toLocaleString("es-AR");
  document.getElementById("statAvg").textContent = fmtUSD(stats.avg_usd);
  document.getElementById("statMedian").textContent = fmtUSD(stats.median_usd);
  document.getElementById("statRange").textContent =
    `${fmtUSD(stats.min_usd)} – ${fmtUSD(stats.max_usd)}`;
  bar.style.display = "grid";
}

function showAnalysis(text) {
  document.getElementById("analysisText").textContent = text;
  document.getElementById("analysisBox").style.display = "block";
}

function hideAnalysis() {
  document.getElementById("analysisBox").style.display = "none";
}

function updateResultsMeta(count, isFeatured, query, sources) {
  const meta = document.getElementById("resultsMeta");
  const countEl = document.getElementById("resultsCount");
  const queryEl = document.getElementById("resultsQuery");

  if (count === null) {
    countEl.textContent = "Buscando...";
    queryEl.textContent = "";
    meta.style.display = "flex";
    return;
  }

  meta.style.display = "flex";
  const alertaBtn = document.getElementById("alertaBtn");
  if (isFeatured) {
    countEl.textContent = `${count} autos populares`;
    queryEl.textContent = "";
    if (alertaBtn) alertaBtn.style.display = "none";
  } else {
    if (alertaBtn) alertaBtn.style.display = count > 0 ? "inline-flex" : "none";
    countEl.textContent = `${count.toLocaleString("es-AR")} autos encontrados`;
    let queryText = query ? `para "${query}"` : "";
    if (sources && (sources.ml || sources.kavak)) {
      const parts = [];
      if (sources.ml) parts.push(`${sources.ml} en ML`);
      if (sources.kavak) parts.push(`${sources.kavak} en Kavak`);
      queryText += (queryText ? " — " : "") + parts.join(" · ");
    }
    queryEl.textContent = queryText;
  }
}

function showYearBreakdown(results) {
  const el = document.getElementById("yearBreakdown");
  const barsEl = document.getElementById("yearBreakdownBars");
  if (!el || !barsEl) return;

  // Agrupar por año
  const byYear = {};
  results.forEach(car => {
    if (!car.year || car.year < 2005 || car.year > 2025) return;
    if (!byYear[car.year]) byYear[car.year] = [];
    byYear[car.year].push(car.price_usd);
  });

  const yearData = Object.entries(byYear)
    .map(([year, prices]) => ({
      year: parseInt(year),
      avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      count: prices.length,
    }))
    .filter(d => d.count >= 2)
    .sort((a, b) => a.year - b.year);

  if (yearData.length < 3) {
    el.style.display = "none";
    return;
  }

  const maxAvg = Math.max(...yearData.map(d => d.avg));
  barsEl.innerHTML = yearData.map(d => {
    const heightPct = Math.round((d.avg / maxAvg) * 100);
    const priceK = d.avg >= 1000 ? `$${Math.round(d.avg / 1000)}k` : `$${d.avg}`;
    return `
      <div class="year-bar-wrap" title="${d.year}: USD ${d.avg.toLocaleString('es-AR')} (${d.count} autos)" onclick="document.getElementById('filterYearFrom').value='${d.year}';document.getElementById('filterYearTo').value='${d.year}';state.year_from='${d.year}';state.year_to='${d.year}';updateActiveFilterCount();applyFilters();">
        <div class="year-bar" style="height:${heightPct}%;"></div>
        <div class="year-bar-label">${d.year}</div>
        <div class="year-bar-price">${priceK}</div>
      </div>`;
  }).join("");

  el.style.display = "block";
}

const RELATED_MAP = {
  "corolla": ["Toyota Etios", "Toyota Yaris", "Honda Civic", "VW Vento", "Chevrolet Cruze"],
  "hilux": ["Ford Ranger", "VW Amarok", "Nissan Frontier", "Mitsubishi L200", "Chevrolet S10"],
  "ranger": ["Toyota Hilux", "VW Amarok", "Nissan Frontier", "Fiat Toro", "Chevrolet S10"],
  "amarok": ["Toyota Hilux", "Ford Ranger", "Nissan Frontier", "Mitsubishi L200"],
  "onix": ["Fiat Cronos", "VW Gol Trend", "Renault Sandero", "Chevrolet Cruze", "Peugeot 208"],
  "gol": ["Chevrolet Onix", "Renault Sandero", "Fiat Cronos", "Peugeot 208"],
  "sandero": ["Renault Kwid", "VW Gol Trend", "Fiat Cronos", "Chevrolet Onix"],
  "duster": ["Renault Koleos", "Hyundai Creta", "Peugeot 2008", "VW Tiguan", "Chevrolet Tracker"],
  "renegade": ["Jeep Compass", "Renault Duster", "Chevrolet Tracker", "Honda HR-V"],
  "compass": ["Jeep Renegade", "Toyota RAV4", "VW Tiguan", "Hyundai Tucson"],
  "civic": ["Toyota Corolla", "VW Vento", "Chevrolet Cruze", "Honda City"],
  "hr-v": ["Honda Fit", "Renault Duster", "Jeep Renegade", "Peugeot 2008"],
  "208": ["Peugeot 308", "VW Polo", "Renault Sandero", "Fiat Cronos"],
  "308": ["Peugeot 208", "VW Golf", "Honda Civic", "Toyota Corolla"],
  "cruze": ["Toyota Corolla", "Honda Civic", "VW Vento", "Chevrolet Onix"],
  "tracker": ["Jeep Renegade", "Renault Duster", "Hyundai Creta", "Honda HR-V"],
  "tucson": ["Hyundai Creta", "Kia Sportage", "VW Tiguan", "Toyota RAV4"],
  "sportage": ["Hyundai Tucson", "Renault Koleos", "VW Tiguan", "Jeep Compass"],
  "golf": ["VW Polo", "Peugeot 308", "Honda Civic", "Toyota Corolla"],
  "polo": ["VW Gol Trend", "Peugeot 208", "Fiat Cronos", "Chevrolet Onix"],
  "etios": ["Toyota Yaris", "Toyota Corolla", "Fiat Cronos", "VW Gol Trend"],
  "cronos": ["Fiat Argo", "VW Gol Trend", "Chevrolet Onix", "Renault Logan"],
};

function showRelatedModels(query) {
  const el = document.getElementById("relatedModels");
  const chips = document.getElementById("relatedChips");
  if (!el || !chips) return;

  const qLower = query.toLowerCase();
  let related = null;
  for (const [key, suggestions] of Object.entries(RELATED_MAP)) {
    if (qLower.includes(key)) {
      related = suggestions;
      break;
    }
  }

  if (!related) {
    el.style.display = "none";
    return;
  }

  chips.innerHTML = related.map(r =>
    `<button class="pop-chip" data-q="${escHtml(r)}">${escHtml(r)}</button>`
  ).join("");
  el.style.display = "block";
}

function hideYearBreakdown() {
  const el = document.getElementById("yearBreakdown");
  if (el) el.style.display = "none";
}

function showFetchError(msg) {
  const grid = document.getElementById("carsGrid");
  grid.innerHTML = `
    <div style="grid-column: 1/-1; text-align:center; padding: 60px 0; color: var(--text2);">
      <p style="font-size:1.1rem; margin-bottom:8px;">Ocurrió un error</p>
      <p style="font-size:0.9rem; color:var(--text3);">${escHtml(msg)}</p>
    </div>
  `;
  document.getElementById("noResults").style.display = "none";
}

// ── SEO dinámico ──────────────────────────────────────────────────────────────

function updateSEO(query) {
  if (query) {
    document.getElementById("pageTitle").textContent = `${query} en Argentina | AutoRadar`;
    document.getElementById("pageDesc").setAttribute("content",
      `Compará precios de ${query} en MercadoLibre Argentina. Precios en USD y ARS con dólar blue actualizado.`
    );
  } else {
    document.getElementById("pageTitle").textContent = "AutoRadar — Compará precios de autos en Argentina";
    document.getElementById("pageDesc").setAttribute("content",
      "Compará precios de autos usados y 0km en Argentina. Precios en dólares y pesos con cotización blue actualizada."
    );
  }
}

function updateStructuredData(results, query) {
  if (!results || !results.length) return;
  const items = results.slice(0, 20).map((car, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "item": {
      "@type": "Car",
      "name": car.title,
      "url": car.permalink,
      "offers": {
        "@type": "Offer",
        "price": car.price_usd,
        "priceCurrency": "USD",
      },
    }
  }));

  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": query ? `${query} en Argentina` : "Autos populares en Argentina",
    "itemListElement": items,
  };

  document.getElementById("structuredData").textContent = JSON.stringify(ld);
}

// ── Filtros ───────────────────────────────────────────────────────────────────

function countActiveFilters() {
  let count = 0;
  if (state.condition) count++;
  if (state.brand) count++;
  if (state.year_from) count++;
  if (state.year_to) count++;
  if (state.price_min_usd) count++;
  if (state.price_max_usd) count++;
  if (state.km_max) count++;
  if (state.price_drop_only) count++;
  if (state.sort && state.sort !== "score_desc") count++;
  return count;
}

function updateActiveFilterCount() {
  const n = countActiveFilters();
  const badge = document.getElementById("filterCountBadge");
  const resetBtn = document.getElementById("filterResetBtn");

  if (n > 0) {
    badge.textContent = n;
    badge.style.display = "inline-flex";
    resetBtn.style.display = "inline-block";
  } else {
    badge.style.display = "none";
    resetBtn.style.display = "none";
  }
}

function resetFilters() {
  state.condition = "";
  state.brand = "";
  state.year_from = "";
  state.year_to = "";
  state.price_min_usd = "";
  state.price_max_usd = "";
  state.km_max = "";
  state.sort = "score_desc";

  // Sincronizar UI
  document.querySelectorAll(".condition-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.value === "");
  });
  document.getElementById("filterBrand").value = "";
  document.getElementById("filterYearFrom").value = "";
  document.getElementById("filterYearTo").value = "";
  document.getElementById("filterPriceMin").value = "";
  document.getElementById("filterPriceMax").value = "";
  const kmEl = document.getElementById("filterKmMax");
  if (kmEl) kmEl.value = "";
  state.price_drop_only = false;
  const pdEl = document.getElementById("filterPriceDrop");
  if (pdEl) pdEl.checked = false;
  document.getElementById("filterSort").value = "score_desc";

  updateActiveFilterCount();
  applyFilters();
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Dollar
  loadDollar();
  setInterval(loadDollar, 5 * 60 * 1000);

  // Search form (header)
  const searchInput = document.getElementById("searchInput");
  const suggestionsBox = document.getElementById("searchSuggestions");

  function showSuggestions(input) {
    if (!suggestionsBox) return;
    const suggestions = getSuggestions(input);
    if (!suggestions.length || !input) {
      suggestionsBox.style.display = "none";
      return;
    }
    suggestionsBox.innerHTML = suggestions.map(s =>
      `<div class="suggestion-item" role="option" data-q="${escHtml(s)}">
        <span class="suggestion-icon">🔍</span>
        <span>${escHtml(s)}</span>
      </div>`
    ).join("");
    suggestionsBox.style.display = "block";
  }

  searchInput?.addEventListener("input", e => {
    showSuggestions(e.target.value.trim());
  });

  searchInput?.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      suggestionsBox.style.display = "none";
    }
  });

  suggestionsBox?.addEventListener("click", e => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    const q = item.dataset.q;
    if (searchInput) searchInput.value = q;
    suggestionsBox.style.display = "none";
    state.query = q;
    saveSearchToHistory(q);
    doSearch();
  });

  // Hide suggestions on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".header-search-box")) {
      if (suggestionsBox) suggestionsBox.style.display = "none";
    }
  });

  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("searchInput").value.trim();
    if (suggestionsBox) suggestionsBox.style.display = "none";
    saveSearchToHistory(q);
    state.query = q;
    doSearch();
  });

  // Condition pills
  document.querySelectorAll(".condition-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".condition-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.condition = pill.dataset.value;
      updateActiveFilterCount();
      applyFilters();
    });
  });

  // Brand filter
  document.getElementById("filterBrand").addEventListener("change", e => {
    state.brand = e.target.value;
    updateActiveFilterCount();
    applyFilters();
  });

  // Year filters (con debounce)
  let yearDebounce;
  document.getElementById("filterYearFrom").addEventListener("input", e => {
    state.year_from = e.target.value;
    updateActiveFilterCount();
    clearTimeout(yearDebounce);
    yearDebounce = setTimeout(applyFilters, 600);
  });
  document.getElementById("filterYearTo").addEventListener("input", e => {
    state.year_to = e.target.value;
    updateActiveFilterCount();
    clearTimeout(yearDebounce);
    yearDebounce = setTimeout(applyFilters, 600);
  });

  // Price drop only filter
  document.getElementById("filterPriceDrop")?.addEventListener("change", e => {
    state.price_drop_only = e.target.checked;
    updateActiveFilterCount();
    applyFilters();
  });

  // Km max filter
  let kmDebounce;
  document.getElementById("filterKmMax")?.addEventListener("input", e => {
    state.km_max = e.target.value;
    updateActiveFilterCount();
    clearTimeout(kmDebounce);
    kmDebounce = setTimeout(applyFilters, 600);
  });

  // Price filters (con debounce)
  let priceDebounce;
  document.getElementById("filterPriceMin").addEventListener("input", e => {
    state.price_min_usd = e.target.value;
    updateActiveFilterCount();
    clearTimeout(priceDebounce);
    priceDebounce = setTimeout(applyFilters, 600);
  });
  document.getElementById("filterPriceMax").addEventListener("input", e => {
    state.price_max_usd = e.target.value;
    updateActiveFilterCount();
    clearTimeout(priceDebounce);
    priceDebounce = setTimeout(applyFilters, 600);
  });

  // Sort
  document.getElementById("filterSort").addEventListener("change", e => {
    state.sort = e.target.value;
    updateActiveFilterCount();
    applyFilters();
  });

  // Reset filtros
  document.getElementById("filterResetBtn").addEventListener("click", resetFilters);

  // Mobile: toggle filtros
  const filterBar = document.getElementById("filterBar");
  const mobileToggle = document.getElementById("filterMobileToggle");
  mobileToggle.addEventListener("click", () => {
    const isOpen = filterBar.classList.toggle("mobile-open");
    mobileToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    mobileToggle.querySelector("span.filter-count-badge") ||
      mobileToggle.appendChild(Object.assign(document.createElement("span"), {
        className: "filter-count-badge",
        id: "filterCountBadge",
      }));
  });

  // Logo → volver al feed
  document.getElementById("logoLink").addEventListener("click", e => {
    e.preventDefault();
    state.query = "";
    document.getElementById("searchInput").value = "";
    resetFilters();
    const url = new URL(window.location);
    url.search = "";
    window.history.pushState({}, "", url);
    updateSEO("");
    setHeroVisible(true);
    loadFeatured();
  });

  // Popular + related chips (delegated to main content)
  document.getElementById("mainContent")?.addEventListener("click", e => {
    const chip = e.target.closest(".pop-chip");
    if (!chip) return;
    const q = chip.dataset.q;
    document.getElementById("searchInput").value = q;
    const mobileInput = document.getElementById("mobileSearchInput");
    if (mobileInput) mobileInput.value = q;
    state.query = q;
    saveSearchToHistory(q);
    doSearch();
  });

  // Chips en "sin resultados"
  document.getElementById("suggestionsChips").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const q = chip.dataset.q;
    document.getElementById("searchInput").value = q;
    state.query = q;
    doSearch();
  });

  // Soporte deep-link via URL params
  const params = new URLSearchParams(window.location.search);
  const qParam = params.get("q");
  if (qParam) {
    state.query = qParam;
    document.getElementById("searchInput").value = qParam;

    // Restaurar filtros desde URL
    const condParam = params.get("condition") || "";
    const brandParam = params.get("brand") || "";
    const yf = params.get("year_from") || "";
    const yt = params.get("year_to") || "";
    const pmin = params.get("price_min_usd") || "";
    const pmax = params.get("price_max_usd") || "";
    const sortParam = params.get("sort") || "score_desc";

    state.condition = condParam;
    state.brand = brandParam;
    state.year_from = yf;
    state.year_to = yt;
    state.price_min_usd = pmin;
    state.price_max_usd = pmax;
    state.sort = sortParam;

    if (condParam) {
      document.querySelectorAll(".condition-pill").forEach(p => {
        p.classList.toggle("active", p.dataset.value === condParam);
      });
    }
    if (brandParam) document.getElementById("filterBrand").value = brandParam;
    if (yf) document.getElementById("filterYearFrom").value = yf;
    if (yt) document.getElementById("filterYearTo").value = yt;
    if (pmin) document.getElementById("filterPriceMin").value = pmin;
    if (pmax) document.getElementById("filterPriceMax").value = pmax;
    document.getElementById("filterSort").value = sortParam;

    updateActiveFilterCount();
    doSearch();
  } else {
    loadFeatured();
  }

  // Mobile search bar
  document.getElementById("mobileSearchBtn")?.addEventListener("click", () => {
    const q = document.getElementById("mobileSearchInput")?.value.trim() || "";
    if (q) {
      state.query = q;
      document.getElementById("searchInput").value = q;
      doSearch();
    }
  });
  document.getElementById("mobileSearchInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (q) {
        state.query = q;
        document.getElementById("searchInput").value = q;
        doSearch();
      }
    }
  });

  // Popstate (botón atrás del browser)
  window.addEventListener("popstate", () => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get("q") || "";
    state.query = q;
    document.getElementById("searchInput").value = q;
    if (q) doSearch(); else loadFeatured();
  });

  // Comparador bar
  document.getElementById("compareBtnAction")?.addEventListener("click", openComparador);
  document.getElementById("compareClear")?.addEventListener("click", () => {
    state.compareList = [];
    updateCompareBar();
    document.querySelectorAll(".car-compare-btn").forEach(btn => {
      btn.classList.remove("compare-active");
    });
  });

  // Modal comparador
  const modal = document.getElementById("comparadorModal");
  document.getElementById("comparadorClose")?.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal?.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });

  // Iniciar scroll observer
  initScrollObserver();

  // Scroll to top
  const scrollTopBtn = document.getElementById("scrollTopBtn");
  window.addEventListener("scroll", () => {
    if (scrollTopBtn) scrollTopBtn.style.display = window.scrollY > 600 ? "flex" : "none";
  }, { passive: true });
  scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // Favoritos: badge inicial + botón para ver favoritos
  updateFavBadge();
  document.getElementById("favBtn")?.addEventListener("click", showFavoritesPage);
  document.getElementById("favModalClose")?.addEventListener("click", () => {
    document.getElementById("favModal").style.display = "none";
  });
  document.getElementById("favModal")?.addEventListener("click", e => {
    if (e.target.id === "favModal") document.getElementById("favModal").style.display = "none";
  });

  // Alertas de precio
  document.getElementById("alertaBtn")?.addEventListener("click", () => {
    document.getElementById("alertaModal").style.display = "flex";
  });
  document.getElementById("alertaClose")?.addEventListener("click", () => {
    document.getElementById("alertaModal").style.display = "none";
  });
  document.getElementById("alertaModal")?.addEventListener("click", e => {
    if (e.target.id === "alertaModal") document.getElementById("alertaModal").style.display = "none";
  });
  document.getElementById("alertaForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const email = document.getElementById("alertaEmail")?.value;
    const query = state.query || "autos";
    document.getElementById("alertaForm").innerHTML = `<p style="color:var(--green);font-weight:600;">✓ Te avisamos cuando haya un ${escHtml(query)} por menos de lo que buscás.</p>`;
    // TODO: backend para enviar email
  });
});
