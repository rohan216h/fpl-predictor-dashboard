/**
 * Player Explorer Page Component
 * Renders searchable and filterable player table with position, team, price, form,
 * blended minutes, rotation risk, and in-depth player detail drawer with shrinkage visualization.
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Page State
  const state = {
    search: '',
    position: '',
    team: '',
    minPrice: '',
    maxPrice: '',
    excludeRisk: false,
    sortBy: 'predicted_points',
    order: 'desc',
    limit: 25,
    offset: 0,
    total: 0,
    players: []
  };

  let debounceTimer = null;
  let teamsList = [];

  /**
   * Fetch players from API based on current state
   */
  async function fetchPlayers() {
    const params = new URLSearchParams();
    if (state.search) params.set('q', state.search);
    if (state.position) params.set('position', state.position);
    if (state.team) params.set('team', state.team);
    if (state.minPrice) params.set('min_price', state.minPrice);
    if (state.maxPrice) params.set('max_price', state.maxPrice);
    if (state.excludeRisk) params.set('rotation_risk', 'false');
    if (state.sortBy) params.set('sort', state.sortBy);
    if (state.order) params.set('order', state.order);
    params.set('limit', state.limit);
    params.set('offset', state.offset);

    const res = await fetch(`/api/players?${params.toString()}`);
    if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Render the Player Explorer Page
   * @param {HTMLElement} container DOM element to mount
   */
  async function renderPlayers(container) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Filter Toolbar -->
        <div class="explorer-toolbar">
          <div class="explorer-toolbar-top">
            <!-- Search Bar -->
            <div class="explorer-search-box">
              <span class="explorer-search-icon">🔍</span>
              <input type="text" id="explorer-search" class="explorer-search-input" 
                     placeholder="Search player by name (e.g. Haaland, Saka, Raya)..." 
                     value="${escapeHtml(state.search)}">
            </div>

            <!-- Position Pills -->
            <div class="position-pill-group">
              <button class="pos-btn ${state.position === '' ? 'active' : ''}" data-pos="">All</button>
              <button class="pos-btn ${state.position === 'GKP' ? 'active' : ''}" data-pos="GKP">GKP</button>
              <button class="pos-btn ${state.position === 'DEF' ? 'active' : ''}" data-pos="DEF">DEF</button>
              <button class="pos-btn ${state.position === 'MID' ? 'active' : ''}" data-pos="MID">MID</button>
              <button class="pos-btn ${state.position === 'FWD' ? 'active' : ''}" data-pos="FWD">FWD</button>
            </div>
          </div>

          <!-- Secondary Filters Row -->
          <div class="explorer-toolbar-bottom">
            <div class="filters-row">
              <!-- Team Filter -->
              <select id="explorer-team" class="filter-select">
                <option value="">All Premier League Clubs</option>
              </select>

              <!-- Price Bounds -->
              <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted);">
                <span>Price:</span>
                <input type="number" id="explorer-min-price" class="filter-select" style="width: 75px;" placeholder="Min" step="0.5" value="${state.minPrice}">
                <span>-</span>
                <input type="number" id="explorer-max-price" class="filter-select" style="width: 75px;" placeholder="Max" step="0.5" value="${state.maxPrice}">
              </div>

              <!-- Rotation Risk Checkbox -->
              <label class="filter-toggle-label">
                <input type="checkbox" id="explorer-risk" ${state.excludeRisk ? 'checked' : ''}>
                <span>Exclude Rotation Risks</span>
              </label>
            </div>

            <!-- Records Per Page -->
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-muted);">
              <span>Rows:</span>
              <select id="explorer-limit" class="filter-select" style="padding: 4px 8px;">
                <option value="25" ${state.limit === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${state.limit === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${state.limit === 100 ? 'selected' : ''}>100</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Table Card -->
        <div class="explorer-table-card">
          <div style="overflow-x: auto;">
            <table class="explorer-table">
              <thead>
                <tr>
                  <th class="sortable ${state.sortBy === 'name' ? 'sorted' : ''}" data-sort="name">
                    Player ${state.sortBy === 'name' ? (state.order === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th>Club</th>
                  <th class="sortable ${state.sortBy === 'price' ? 'sorted' : ''}" data-sort="price" style="text-align: right;">
                    Price ${state.sortBy === 'price' ? (state.order === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th class="sortable ${state.sortBy === 'form' ? 'sorted' : ''}" data-sort="form" style="text-align: right;">
                    Form (5G / 3G) ${state.sortBy === 'form' ? (state.order === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th class="sortable ${state.sortBy === 'minutes' ? 'sorted' : ''}" data-sort="minutes" style="text-align: right;">
                    Minutes ${state.sortBy === 'minutes' ? (state.order === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style="text-align: right;">ICT Index</th>
                  <th style="text-align: center;">Shrinkage Weight</th>
                  <th class="sortable ${state.sortBy === 'predicted_points' ? 'sorted' : ''}" data-sort="predicted_points" style="text-align: right;">
                    GW5 Pred ${state.sortBy === 'predicted_points' ? (state.order === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style="text-align: center;">Action</th>
                </tr>
              </thead>
              <tbody id="explorer-tbody">
                <tr>
                  <td colspan="9" style="text-align:center; padding: 40px; color: var(--text-muted);">
                    Loading database...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Bar -->
          <div class="explorer-pagination">
            <span id="explorer-count-label">Loading records...</span>
            <div class="pagination-btn-group">
              <button id="btn-prev-page" class="btn-page" disabled>&larr; Previous</button>
              <span id="explorer-page-label" style="font-weight: 700; color: var(--text-primary);">Page 1</span>
              <button id="btn-next-page" class="btn-page" disabled>Next &rarr;</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach listeners
    attachEventListeners(container);

    // Initial Load
    await updateTableData(container);
  }

  /**
   * Update table rows & pagination
   */
  async function updateTableData(container) {
    const tbody = container.querySelector('#explorer-tbody');
    const countLabel = container.querySelector('#explorer-count-label');
    const pageLabel = container.querySelector('#explorer-page-label');
    const btnPrev = container.querySelector('#btn-prev-page');
    const btnNext = container.querySelector('#btn-next-page');

    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding: 30px; color: var(--text-muted);">
          <div class="fpl-spinner" style="width:24px; height:24px; margin:0 auto 8px auto; border-width:3px;"></div>
          Filtering &amp; sorting players...
        </td>
      </tr>
    `;

    try {
      const data = await fetchPlayers();
      state.total = data.total || 0;
      state.players = data.players || [];

      // Populate teams dropdown if empty
      if (teamsList.length === 0 && state.players.length > 0) {
        // Fetch all players once for unique club names
        fetch('/api/players?limit=300').then(r => r.json()).then(allData => {
          if (allData.players) {
            const uniqueTeams = Array.from(new Set(allData.players.map(p => p.team))).sort();
            teamsList = uniqueTeams;
            const teamSelect = container.querySelector('#explorer-team');
            if (teamSelect) {
              teamSelect.innerHTML = `<option value="">All Premier League Clubs (${uniqueTeams.length})</option>` +
                uniqueTeams.map(t => `<option value="${escapeHtml(t)}" ${state.team === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
            }
          }
        }).catch(() => {});
      }

      if (state.players.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; padding: 40px; color: var(--text-muted);">
              No players match your search and filter criteria.
            </td>
          </tr>
        `;
        countLabel.textContent = 'Showing 0 of 0 players';
        btnPrev.disabled = true;
        btnNext.disabled = true;
        return;
      }

      tbody.innerHTML = state.players.map(p => {
        const weightPct = ((p.weight_current_season || 0.95) * 100).toFixed(0);
        const isRisk = p.rotation_risk;

        return `
          <tr class="explorer-row" data-player-id="${p.fpl_id}">
            <td>
              <div>
                <strong style="color: var(--text-primary); font-size: 0.92rem;">${escapeHtml(p.web_name)}</strong>
                <span class="badge badge-neutral" style="font-size: 0.65rem; padding: 1px 5px; margin-left: 4px;">
                  ${p.position}
                </span>
                <div style="font-size: 0.74rem; color: var(--text-muted);">
                  ${escapeHtml(p.full_name || p.web_name)}
                </div>
              </div>
            </td>
            <td>
              <span style="font-weight: 600; color: var(--text-secondary);">${escapeHtml(p.team)}</span>
            </td>
            <td style="text-align: right; font-weight: 700; color: var(--text-primary);">
              &pound;${(p.price || 0).toFixed(1)}m
            </td>
            <td style="text-align: right;">
              <span style="font-weight: 700; color: var(--text-primary);">${(p.total_points_avg_last5 || 0).toFixed(1)}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 2px;">/ ${(p.total_points_avg_last3 || 0).toFixed(1)}</span>
            </td>
            <td style="text-align: right;">
              <span style="font-weight: 600;">${Math.round(p.blended_avg_minutes || 0)}'</span>
              ${isRisk ? `<span class="badge badge-magenta" style="font-size:0.62rem; padding:1px 4px; margin-left:2px;" title="Rotation Risk">Risk</span>` : ''}
            </td>
            <td style="text-align: right; color: var(--text-secondary);">
              ${(p.ict_index_avg_last5 || 0).toFixed(1)}
            </td>
            <td style="text-align: center;">
              <span class="badge badge-neutral" style="font-size:0.7rem;" title="Shrinkage weight n/(n+0.1): ${weightPct}% current season vs prior">
                ${weightPct}% Live
              </span>
            </td>
            <td style="text-align: right;">
              <strong style="color: var(--fpl-green-neon); font-size: 1.05rem;">
                ${(p.predicted_points || 0).toFixed(2)}
              </strong>
            </td>
            <td style="text-align: center;">
              <button class="btn-inspect-player" style="padding: 4px 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-xs); color: var(--fpl-cyan-neon); font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                Inspect
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Attach row click to open drawer
      const rows = tbody.querySelectorAll('.explorer-row');
      rows.forEach((row, i) => {
        row.addEventListener('click', () => {
          showPlayerDrawer(state.players[i]);
        });
      });

      // Update Pagination Bar
      const startRecord = state.offset + 1;
      const endRecord = Math.min(state.offset + state.players.length, state.total);
      const currentPage = Math.floor(state.offset / state.limit) + 1;
      const totalPages = Math.ceil(state.total / state.limit) || 1;

      countLabel.textContent = `Showing ${startRecord}-${endRecord} of ${state.total} players`;
      pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;

      btnPrev.disabled = state.offset === 0;
      btnNext.disabled = endRecord >= state.total;

    } catch (err) {
      console.error('Table update failed:', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding: 40px; color: var(--fpl-magenta-neon);">
            Failed to load players: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  /**
   * Attach all interactive filter & pagination listeners
   */
  function attachEventListeners(container) {
    const searchInput = container.querySelector('#explorer-search');
    const posButtons = container.querySelectorAll('.pos-btn');
    const teamSelect = container.querySelector('#explorer-team');
    const minPriceInput = container.querySelector('#explorer-min-price');
    const maxPriceInput = container.querySelector('#explorer-max-price');
    const riskCheckbox = container.querySelector('#explorer-risk');
    const limitSelect = container.querySelector('#explorer-limit');
    const btnPrev = container.querySelector('#btn-prev-page');
    const btnNext = container.querySelector('#btn-next-page');
    const sortHeaders = container.querySelectorAll('th.sortable');

    // Search input with debounce
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.search = e.target.value.trim();
          state.offset = 0;
          updateTableData(container);
        }, 250);
      });
    }

    // Position pills
    posButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        posButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.position = btn.getAttribute('data-pos');
        state.offset = 0;
        updateTableData(container);
      });
    });

    // Team select
    if (teamSelect) {
      teamSelect.addEventListener('change', (e) => {
        state.team = e.target.value;
        state.offset = 0;
        updateTableData(container);
      });
    }

    // Min & Max Price
    if (minPriceInput) {
      minPriceInput.addEventListener('change', (e) => {
        state.minPrice = e.target.value;
        state.offset = 0;
        updateTableData(container);
      });
    }
    if (maxPriceInput) {
      maxPriceInput.addEventListener('change', (e) => {
        state.maxPrice = e.target.value;
        state.offset = 0;
        updateTableData(container);
      });
    }

    // Rotation risk
    if (riskCheckbox) {
      riskCheckbox.addEventListener('change', (e) => {
        state.excludeRisk = e.target.checked;
        state.offset = 0;
        updateTableData(container);
      });
    }

    // Limit select
    if (limitSelect) {
      limitSelect.addEventListener('change', (e) => {
        state.limit = parseInt(e.target.value, 10) || 25;
        state.offset = 0;
        updateTableData(container);
      });
    }

    // Pagination buttons
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (state.offset > 0) {
          state.offset = Math.max(0, state.offset - state.limit);
          updateTableData(container);
        }
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (state.offset + state.limit < state.total) {
          state.offset += state.limit;
          updateTableData(container);
        }
      });
    }

    // Sort headers
    sortHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const sortField = th.getAttribute('data-sort');
        if (state.sortBy === sortField) {
          state.order = state.order === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortBy = sortField;
          state.order = 'desc';
        }
        state.offset = 0;
        renderPlayers(container); // Re-render for header arrows
      });
    });
  }

  /**
   * Detailed Player Drawer with Shrinkage Formulation Breakdown
   */
  function showPlayerDrawer(p) {
    const modal = document.getElementById('player-modal');
    const content = document.getElementById('modal-content');
    if (!modal || !content) return;

    const weightCur = p.weight_current_season || 0.95;
    const weightPrior = 1.0 - weightCur;
    const curPct = (weightCur * 100).toFixed(0);
    const priorPct = (weightPrior * 100).toFixed(0);
    const isRisk = p.rotation_risk;

    content.innerHTML = `
      <div class="player-modal-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; padding-right: 30px;">
          <div>
            <span class="badge badge-neutral" style="margin-bottom: 6px;">${p.position} &bull; ${escapeHtml(p.team)}</span>
            <h2 id="modal-player-name" style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin: 0;">
              ${escapeHtml(p.web_name)}
            </h2>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">
              ${escapeHtml(p.full_name || p.web_name)}
            </div>
          </div>
          <div style="text-align:right;">
            <span style="display:block; font-size: 0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Current Price</span>
            <span style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">&pound;${(p.price || 0).toFixed(1)}m</span>
          </div>
        </div>
      </div>

      <!-- GW5 Prediction Hero -->
      <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size: 0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">GW5 Expected Points</span>
            <div style="font-size: 2.2rem; font-weight: 900; color: var(--fpl-green-neon); line-height: 1.1; margin-top: 4px;">
              ${(p.predicted_points || 0).toFixed(2)} pts
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-size: 0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:600; display:block; margin-bottom: 4px;">Playing Status</span>
            <span class="badge ${isRisk ? 'badge-magenta' : 'badge-green'}">
              ${isRisk ? '⚠ Rotation Risk' : '&check; Secure Starter'}
            </span>
          </div>
        </div>
      </div>

      <!-- Shrinkage Blending Formulation -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <strong style="font-size: 0.85rem; color: var(--text-primary);">
            Shrinkage Blending Formula
          </strong>
          <span style="font-size: 0.75rem; color: var(--fpl-cyan-neon); font-family: monospace;">
            w = n / (n + 0.1)
          </span>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 10px;">
          Where <code>n = minutes / 90</code> (${p.games_played_current || 4} appearances, ${Math.round(p.blended_avg_minutes * 4)} total mins). Shrunk toward last season's prior to dampen early-season variance.
        </p>

        <!-- Visual Shrinkage Meter -->
        <div class="shrinkage-bar-wrapper">
          <div class="shrinkage-meter">
            <div class="shrinkage-cur" style="width: ${curPct}%;" title="Current Season Form: ${curPct}%"></div>
            <div class="shrinkage-prior" style="width: ${priorPct}%;" title="Prior Season Mean: ${priorPct}%"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size: 0.72rem; color: var(--text-muted);">
            <span style="color: var(--fpl-green-neon); font-weight:700;">${curPct}% 2024-25 Live Form</span>
            <span>${priorPct}% Prior Season Baseline</span>
          </div>
        </div>
      </div>

      <!-- Form Trend Metrics Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">3-Game Form</span>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
            ${(p.total_points_avg_last3 || 0).toFixed(2)}
          </div>
        </div>
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">5-Game Form</span>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
            ${(p.total_points_avg_last5 || 0).toFixed(2)}
          </div>
        </div>
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">Blended Minutes</span>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
            ${Math.round(p.blended_avg_minutes || 0)}' / game
          </div>
        </div>
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">ICT Index</span>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
            ${(p.ict_index_avg_last5 || 0).toFixed(1)}
          </div>
        </div>
      </div>

      <!-- Attacking & Defensive Contribution -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; font-size: 0.8rem; margin-bottom: 6px;">
          <span style="color:var(--text-secondary);">Goals / Assists (Last 5 Avg)</span>
          <strong style="color:var(--text-primary);">${(p.goals_scored_avg_last5 || 0).toFixed(2)}G / ${(p.assists_avg_last5 || 0).toFixed(2)}A</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.8rem; margin-bottom: 6px;">
          <span style="color:var(--text-secondary);">Bonus Points per Game</span>
          <strong style="color:var(--text-primary);">${(p.bonus_avg_last5 || 0).toFixed(2)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.8rem;">
          <span style="color:var(--text-secondary);">Team Clean Sheet Rate</span>
          <strong style="color:var(--text-primary);">${((p.team_clean_sheet_rate_last5 || 0) * 100).toFixed(0)}%</strong>
        </div>
      </div>

      <button id="modal-close-action" style="width:100%; padding: 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-weight: 600; cursor: pointer;">
        Close Player Details
      </button>
    `;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    const actionBtn = document.getElementById('modal-close-action');
    if (actionBtn && window.closePlayerModal) {
      actionBtn.addEventListener('click', window.closePlayerModal);
    }
  }

  // Export to window
  window.renderPlayersPage = renderPlayers;
})();

