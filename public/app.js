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
  stats: null,
  loading: false,
  isFeatured: false,
};

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

async function loadFeatured() {
  state.loading = true;
  state.isFeatured = true;

  renderSkeletons(24);
  showStats(null);
  updateResultsMeta(null, true);

  try {
    const r = await fetch("/api/featured");
    const data = await r.json();
    if (data.error) {
      showFetchError(data.error);
      return;
    }
    state.results = data.results || [];
    state.stats = data.stats;
    renderResults(data);
    updateResultsMeta(data.results?.length || 0, true);
    showStats(data.stats);
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
    state.results = data.results || [];
    state.stats = data.stats;
    renderResults(data);
    updateResultsMeta(data.results?.length || 0, false, q);
    showStats(data.stats);
    if (data.analysis) {
      showAnalysis(data.analysis);
    }
  } catch (err) {
    showFetchError("Error al conectar con el servidor.");
  } finally {
    state.loading = false;
  }
}

// ── Re-ejecutar según estado actual ──────────────────────────────────────────

function applyFilters() {
  if (state.query.trim()) {
    doSearch();
  } else {
    // Featured no soporta filtros — los ignoramos silenciosamente
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

  // Badge precio
  let priceBadgeHtml = "";
  if (avgUsd && car.price_usd) {
    if (car.price_usd < avgUsd * 0.9) {
      priceBadgeHtml = `<span class="car-badge badge-justo">Precio justo</span>`;
    } else if (car.price_usd > avgUsd * 1.2) {
      priceBadgeHtml = `<span class="car-badge badge-caro">Caro</span>`;
    }
  }

  // Badge condición
  const conditionBadgeHtml = isNew
    ? `<span class="badge-condition badge-new">0km</span>`
    : `<span class="badge-condition badge-used">Usado</span>`;

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

  // Localización
  const locationHtml = car.location
    ? `<span class="car-location" title="${escHtml(car.location)}">📍 ${escHtml(car.location)}</span>`
    : `<span class="car-location"></span>`;

  a.innerHTML = `
    <div class="car-image-wrap">
      ${imgHtml}
      ${priceBadgeHtml}
      ${conditionBadgeHtml}
    </div>
    <div class="car-body">
      <div class="car-year-title">
        ${yearHtml}
        <div class="car-title">${escHtml(car.title)}</div>
      </div>
      <div class="car-price-usd">${fmtUSD(car.price_usd)}</div>
      <div class="car-price-ars">${fmtARS(car.price_ars)}</div>
      ${kmTagHtml ? `<div class="car-meta">${kmTagHtml}</div>` : ""}
      <div class="car-footer">
        ${locationHtml}
        <span class="car-cta-btn">Ver en ML →</span>
      </div>
    </div>
  `;

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

function updateResultsMeta(count, isFeatured, query) {
  const meta = document.getElementById("resultsMeta");
  const countEl = document.getElementById("resultsCount");
  const queryEl = document.getElementById("resultsQuery");

  if (count === null) {
    // Loading
    countEl.textContent = "Buscando...";
    queryEl.textContent = "";
    meta.style.display = "flex";
    return;
  }

  meta.style.display = "flex";
  if (isFeatured) {
    countEl.textContent = `${count} autos populares`;
    queryEl.textContent = "";
  } else {
    countEl.textContent = `${count.toLocaleString("es-AR")} autos encontrados`;
    queryEl.textContent = query ? `para "${query}"` : "";
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

  // Popstate (botón atrás del browser)
  window.addEventListener("popstate", () => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get("q") || "";
    state.query = q;
    document.getElementById("searchInput").value = q;
    if (q) doSearch(); else loadFeatured();
  });
});
