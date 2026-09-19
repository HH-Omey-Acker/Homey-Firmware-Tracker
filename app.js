(async function () {
  const tabsEl = document.querySelector(".tabs");
  const panelsEl = document.getElementById("panels");
  const searchEl = document.getElementById("search");
  const searchCountEl = document.getElementById("search-count");
  const lastUpdatedEl = document.getElementById("last-updated");

  const state = {
    sources: [], // [{ id, label, file, entries }]
    activeId: null,
    query: "",
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDate(iso) {
    if (!iso) return "–";
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function loadJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  async function init() {
    let manifest;
    try {
      manifest = await loadJson("data/manifest.json");
    } catch (err) {
      panelsEl.innerHTML = `<div class="load-error">Couldn't load the changelog data (${escapeHtml(
        err.message
      )}). If you're viewing this straight from the file system, serve it over HTTP instead — browsers block fetch() on file:// URLs.</div>`;
      return;
    }

    lastUpdatedEl.textContent = manifest.lastRun ? formatDate(manifest.lastRun.slice(0, 10)) : "–";

    const results = await Promise.allSettled(
      manifest.sources.map((s) => loadJson(`data/${s.file}`))
    );

    state.sources = manifest.sources.map((s, i) => ({
      ...s,
      entries: results[i].status === "fulfilled" ? results[i].value : [],
      loadFailed: results[i].status === "rejected",
    }));

    state.activeId = state.sources[0]?.id ?? null;

    renderTabs();
    renderPanels();
    applyFilter();
  }

  function renderTabs() {
    tabsEl.innerHTML = state.sources
      .map(
        (s) => `
      <button class="tab-btn" role="tab" data-id="${s.id}" aria-selected="${s.id === state.activeId}">
        ${escapeHtml(s.label)} <span class="tab-count">${s.entries.length}</span>
      </button>`
      )
      .join("");

    tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeId = btn.dataset.id;
        renderTabs();
        panelsEl.querySelectorAll(".panel").forEach((p) => {
          p.hidden = p.dataset.id !== state.activeId;
        });
        applyFilter();
      });
    });
  }

  function renderPanels() {
    panelsEl.innerHTML = state.sources
      .map((s) => {
        if (s.loadFailed) {
          return `<section class="panel" data-id="${s.id}" ${
            s.id === state.activeId ? "" : "hidden"
          }><div class="load-error">Couldn't load data for ${escapeHtml(
            s.label
          )}.</div></section>`;
        }
        if (s.entries.length === 0) {
          return `<section class="panel" data-id="${s.id}" ${
            s.id === state.activeId ? "" : "hidden"
          }><div class="empty-state">No versions recorded yet. The tracker fills this in on its next scheduled run.</div></section>`;
        }
        const rows = s.entries
          .map(
            (e) => `
          <tr data-version="${escapeHtml(e.version.toLowerCase())}" data-text="${escapeHtml(
              (e.descriptionText || "").toLowerCase()
            )}">
            <td class="col-version">${escapeHtml(e.version)}</td>
            <td class="col-date">
              ${formatDate(e.date)}<br />
              <span class="badge ${
                e.dateSource === "official" ? "badge-official" : "badge-discovered"
              }">${e.dateSource === "official" ? "official" : "discovered"}</span>
            </td>
            <td class="col-description">${e.description || ""}</td>
          </tr>`
          )
          .join("");

        return `
        <section class="panel" data-id="${s.id}" ${s.id === state.activeId ? "" : "hidden"}>
          <div class="panel-meta">
            <span>${s.entries.length} version${s.entries.length === 1 ? "" : "s"} recorded</span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Date first available</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
      })
      .join("");
  }

  function applyFilter() {
    const q = state.query.trim().toLowerCase();
    const activePanel = panelsEl.querySelector(`.panel[data-id="${state.activeId}"]`);
    if (!activePanel) return;

    const rows = activePanel.querySelectorAll("tbody tr");
    let visible = 0;
    rows.forEach((row) => {
      const haystack = row.dataset.version + " " + row.dataset.text;
      const match = !q || haystack.includes(q);
      row.classList.toggle("is-hidden", !match);
      if (match) visible += 1;
    });

    if (rows.length > 0) {
      searchCountEl.textContent = q
        ? `${visible} of ${rows.length} version${rows.length === 1 ? "" : "s"} match "${state.query.trim()}"`
        : "";
    } else {
      searchCountEl.textContent = "";
    }
  }

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    applyFilter();
  });

  init();
})();
