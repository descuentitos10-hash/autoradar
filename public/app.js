// ── Estado global ─────────────────────────────────────────────────────────────

const state = {
  query: "",
  condition: "",
  brand: "",
  year_from: "",
  year_to: "",
  price_min_usd: "",
  price_max_usd: "",
  sort: "price_asc",
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
  if (state.sort) params.set("sort", state.sort);
  return `/api/search?${params.toString()}`;
}

// ── Fetch de datos ────────────────────────────────────────────────────────────

function setPopularChipsVisible(v) {
  document.getElementById("popularSearches")?.classList.toggle("visible", v);
}

async function loadFeatured() {
  state.loading = true;
  state.isFeatured = true;
  state.compareList = [];
  updateCompareBar();
  setPopularChipsVisible(true);

  renderSkeletons(24);
  showStats(null);
  updateResultsMeta(null, true);

  try {
    // Intentar primero el inventario KV (10k autos, rápido)
    const invR = await fetch("/api/inventory?sort=score_desc&limit=160");
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

  const fields = [
    { label: "Precio USD", fn: c => `<strong style="color:var(--accent)">${fmtUSD(c.price_usd)}</strong>` },
    { label: "Precio ARS", fn: c => fmtARS(c.price_ars) },
    { label: "Año", fn: c => c.year || "—" },
    { label: "Kilómetros", fn: c => c.km ? c.km.toLocaleString("es-AR") + " km" : "—" },
    { label: "Condición", fn: c => c.condition },
    { label: "Ubicación", fn: c => c.location || "—" },
    { label: "Fuente", fn: c => c.source === "kavak" ? "Kavak" : "MercadoLibre" },
    { label: "Score", fn: c => c.score !== undefined ? `${c.score}/100` : "—" },
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

  // Localización
  const locationHtml = car.location
    ? `<span class="car-location" title="${escHtml(car.location)}">📍 ${escHtml(car.location)}</span>`
    : `<span class="car-location"></span>`;

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
      <div class="car-year-title">
        ${yearHtml}
        <div class="car-title">${escHtml(car.title)}</div>
      </div>
      <div class="car-price-usd">${fmtUSD(car.price_usd)}</div>
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
  const avgStats = { avg_usd: avg };
  state.favorites.forEach(car => {
    grid.appendChild(buildCarCard(car, avgStats));
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
  if (state.sort && state.sort !== "price_asc") count++;
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
  state.sort = "price_asc";

  // Sincronizar UI
  document.querySelectorAll(".condition-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.value === "");
  });
  document.getElementById("filterBrand").value = "";
  document.getElementById("filterYearFrom").value = "";
  document.getElementById("filterYearTo").value = "";
  document.getElementById("filterPriceMin").value = "";
  document.getElementById("filterPriceMax").value = "";
  document.getElementById("filterSort").value = "price_asc";

  updateActiveFilterCount();
  applyFilters();
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Dollar
  loadDollar();
  setInterval(loadDollar, 5 * 60 * 1000);

  // Search form (header)
  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("searchInput").value.trim();
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
    loadFeatured();
  });

  // Popular search chips (home)
  document.getElementById("popularSearches")?.addEventListener("click", e => {
    const chip = e.target.closest(".pop-chip");
    if (!chip) return;
    const q = chip.dataset.q;
    document.getElementById("searchInput").value = q;
    if (document.getElementById("mobileSearchInput")) {
      document.getElementById("mobileSearchInput").value = q;
    }
    state.query = q;
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
    const sortParam = params.get("sort") || "price_asc";

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
