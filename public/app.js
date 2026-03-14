// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(n) {
  return "USD " + Math.round(n).toLocaleString("es-AR");
}

function fmtARS(n) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

function fmtKm(n) {
  if (!n) return null;
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

// ── Search ────────────────────────────────────────────────────────────────────

async function doSearch(query) {
  if (!query.trim()) return;

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set("q", query);
  window.history.pushState({}, "", url);

  showResults(query);
  showLoading(true);

  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await r.json();

    if (data.error && !data.results) {
      showError(data.error);
      return;
    }

    renderResults(query, data);
  } catch (err) {
    showError("Error al conectar con el servidor.");
  } finally {
    showLoading(false);
  }
}

function renderResults(query, data) {
  const { results = [], stats, analysis } = data;

  // Title
  document.getElementById("resultsTitle").textContent = `Resultados para "${query}"`;
  document.getElementById("resultsSub").textContent =
    results.length
      ? `${results.length} publicaciones encontradas en MercadoLibre`
      : "No se encontraron publicaciones";

  // Stats
  if (stats && results.length) {
    document.getElementById("statCount").textContent = stats.count;
    document.getElementById("statAvg").textContent = fmtUSD(stats.avg_usd);
    document.getElementById("statMedian").textContent = fmtUSD(stats.median_usd);
    document.getElementById("statRange").textContent =
      `${fmtUSD(stats.min_usd)} – ${fmtUSD(stats.max_usd)}`;
    document.getElementById("statsBar").style.display = "grid";
  } else {
    document.getElementById("statsBar").style.display = "none";
  }

  // Analysis
  if (analysis) {
    document.getElementById("analysisText").textContent = analysis;
    document.getElementById("analysisBox").style.display = "block";
  } else {
    document.getElementById("analysisBox").style.display = "none";
  }

  // Cards
  const grid = document.getElementById("carsGrid");
  grid.innerHTML = "";

  if (!results.length) {
    document.getElementById("noResults").style.display = "block";
    return;
  }

  document.getElementById("noResults").style.display = "none";

  results.forEach(car => {
    const card = document.createElement("a");
    card.className = "car-card";
    card.href = car.permalink;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const km = fmtKm(car.km);
    const year = car.year ? String(car.year) : null;
    const isNew = car.condition === "0km";

    card.innerHTML = `
      ${car.thumbnail
        ? `<img class="car-image" src="${car.thumbnail}" alt="${car.title}" loading="lazy" onerror="this.parentNode.replaceChild(Object.assign(document.createElement('div'), {className:'car-image-placeholder', textContent:'🚗'}), this)" />`
        : `<div class="car-image-placeholder">🚗</div>`
      }
      <div class="car-body">
        <div class="car-title">${car.title}</div>
        <div class="car-price-usd">${fmtUSD(car.price_usd)}</div>
        <div class="car-price-ars">${fmtARS(car.price_ars)}</div>
        <div class="car-meta">
          ${isNew ? `<span class="car-tag condition-new">0 km</span>` : ""}
          ${year ? `<span class="car-tag">${year}</span>` : ""}
          ${km ? `<span class="car-tag">${km}</span>` : ""}
        </div>
        ${car.location ? `<div class="car-location">📍 ${car.location}</div>` : ""}
      </div>
    `;
    grid.appendChild(card);
  });
}

// ── UI State ──────────────────────────────────────────────────────────────────

function showResults(query) {
  document.getElementById("hero").style.display = "none";
  document.getElementById("resultsSection").style.display = "block";
  document.getElementById("resultsTitle").textContent = `Buscando "${query}"...`;
  document.getElementById("resultsSub").textContent = "";
  document.getElementById("statsBar").style.display = "none";
  document.getElementById("analysisBox").style.display = "none";
  document.getElementById("noResults").style.display = "none";
  document.getElementById("carsGrid").innerHTML = "";
}

function showLoading(visible) {
  document.getElementById("loading").style.display = visible ? "flex" : "none";
}

function showError(msg) {
  document.getElementById("resultsTitle").textContent = "Error";
  document.getElementById("resultsSub").textContent = msg;
  document.getElementById("carsGrid").innerHTML = "";
}

function goHome() {
  document.getElementById("hero").style.display = "flex";
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("searchInput").value = "";
  document.getElementById("searchInput").focus();
  const url = new URL(window.location);
  url.searchParams.delete("q");
  window.history.pushState({}, "", url);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadDollar();
  setInterval(loadDollar, 5 * 60 * 1000); // refresh every 5 min

  // Search form
  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("searchInput").value.trim();
    if (q) doSearch(q);
  });

  // Chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.q;
      document.getElementById("searchInput").value = q;
      doSearch(q);
    });
  });

  // Back button
  document.getElementById("newSearchBtn").addEventListener("click", goHome);

  // Check URL params (deep link support)
  const params = new URLSearchParams(window.location.search);
  const qParam = params.get("q");
  if (qParam) {
    document.getElementById("searchInput").value = qParam;
    doSearch(qParam);
  }
});
