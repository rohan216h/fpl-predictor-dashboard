/**
 * Transfers Page Component
 * Renders the linear programming transfer solver results, the 1.0-point hurdle visualizer,
 * the explicit BANK recommendation banner, and detailed evaluated trades.
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

  /**
   * Render the Transfers Page
   * @param {HTMLElement} container DOM element to mount
   */
  async function renderTransfers(container) {
    try {
      const response = await fetch('/api/transfers');
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }
      const data = await response.json();

      const isBanked = data.is_banked;
      const rec = data.recommended || {};
      const options = data.options_evaluated || [];
      const threshold = data.min_gain_threshold || 1.0;
      const freeTransfers = data.free_transfers_available || 3;

      // Hurdle percentage positioning (scale 0 to 2.0 points = 0 to 100%)
      const maxScale = 2.0;
      const hurdlePct = (threshold / maxScale) * 100;

      // Render evaluation bars
      const barsHtml = options.map(opt => {
        const transfersCount = opt.transfers;
        const gain = opt.gain || 0;
        const netBenefit = opt.net_benefit || 0;
        const hits = opt.hits_taken || 0;
        const hitCost = opt.hit_cost || 0;
        const clears = netBenefit >= threshold;

        // Bar width constrained to 0-100%
        const barWidthPct = Math.max(2, Math.min(100, (Math.max(0, netBenefit) / maxScale) * 100));

        let statusClass = clears ? 'cleared' : 'missed';
        if (netBenefit < 0) statusClass = 'penalty';

        const labelText = netBenefit < 0 ? `${netBenefit.toFixed(2)} pts (Hit)` : `+${netBenefit.toFixed(2)} pts`;

        return `
          <div class="option-bar-row">
            <div>
              <strong style="color: var(--text-primary); font-size: 0.88rem;">${transfersCount} Transfer${transfersCount === 1 ? '' : 's'}</strong>
              <div style="font-size: 0.72rem; color: var(--text-muted);">
                ${hits > 0 ? `-${hitCost} pts (${hits} hit)` : 'Free (0 hits)'}
              </div>
            </div>
            <div class="option-track">
              <div class="option-fill ${statusClass}" style="width: ${barWidthPct}%;">
                ${labelText}
              </div>
            </div>
            <div style="text-align: right;">
              <span class="badge ${clears ? 'badge-green' : 'badge-neutral'}">
                ${clears ? '&check; Clears' : (transfersCount === 0 ? 'Baseline' : '&cross; Misses')}
              </span>
            </div>
          </div>
        `;
      }).join('');

      // Render evaluated trades detail cards
      const tradesDetailHtml = options.filter(opt => opt.transfers > 0).map(opt => {
        const net = opt.net_benefit || 0;
        const clears = net >= threshold;
        const diff = net - threshold;

        const outList = (opt.out_players || []).map(p => `
          <div class="player-transfer-pill pill-out">
            <div>
              <span style="font-weight:700; color:var(--text-primary); cursor:pointer;" onclick="window.openPlayerModal('${escapeHtml(p.web_name)}', '${escapeHtml(p.team)}')">
                ${escapeHtml(p.web_name)}
              </span>
              <span style="font-size:0.72rem; color:var(--text-muted); margin-left:4px;">
                ${escapeHtml(p.position)} &bull; ${escapeHtml(p.team)}
              </span>
            </div>
            <div style="text-align:right;">
              <span style="color:var(--fpl-magenta-neon); font-weight:700;">&pound;${(p.price || 0).toFixed(1)}m</span>
              <span style="font-size:0.72rem; color:var(--text-muted); display:block;">pts: ${(p.transfer_score || 0).toFixed(2)}</span>
            </div>
          </div>
        `).join('');

        const inList = (opt.in_players || []).map(p => `
          <div class="player-transfer-pill pill-in">
            <div>
              <span style="font-weight:700; color:var(--text-primary); cursor:pointer;" onclick="window.openPlayerModal('${escapeHtml(p.web_name)}', '${escapeHtml(p.team)}')">
                ${escapeHtml(p.web_name)}
              </span>
              <span style="font-size:0.72rem; color:var(--text-muted); margin-left:4px;">
                ${escapeHtml(p.position)} &bull; ${escapeHtml(p.team)}
              </span>
            </div>
            <div style="text-align:right;">
              <span style="color:var(--fpl-green-neon); font-weight:700;">&pound;${(p.price || 0).toFixed(1)}m</span>
              <span style="font-size:0.72rem; color:var(--text-muted); display:block;">pts: ${(p.transfer_score || 0).toFixed(2)}</span>
            </div>
          </div>
        `).join('');

        return `
          <div class="card" style="margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 12px;">
              <div>
                <span style="font-weight: 800; font-size: 1.05rem; color: var(--text-primary);">
                  ${opt.transfers} Transfer Move Evaluation
                </span>
                <span style="font-size: 0.78rem; color: var(--text-muted); margin-left: 8px;">
                  Raw Gain: +${(opt.gain || 0).toFixed(2)} pts &bull; Hits: -${opt.hit_cost || 0} pts
                </span>
              </div>
              <span class="badge ${clears ? 'badge-green' : 'badge-magenta'}">
                Net: ${net >= 0 ? '+' : ''}${net.toFixed(2)} pts (${diff >= 0 ? '+' + diff.toFixed(2) : diff.toFixed(2)} vs hurdle)
              </span>
            </div>

            <div class="transfer-moves-grid">
              <div>
                <span style="font-size: 0.74rem; text-transform: uppercase; color: var(--fpl-magenta-neon); font-weight: 700; display: block; margin-bottom: 6px;">
                  &darr; Transfer Out (${(opt.out_players || []).length})
                </span>
                ${outList}
              </div>
              <div>
                <span style="font-size: 0.74rem; text-transform: uppercase; color: var(--fpl-green-neon); font-weight: 700; display: block; margin-bottom: 6px;">
                  &uarr; Transfer In (${(opt.in_players || []).length})
                </span>
                ${inList}
              </div>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Headline Recommendation Hero Banner -->
          <div class="bank-hero-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
              <div>
                <span class="badge ${isBanked ? 'badge-cyan' : 'badge-green'}" style="margin-bottom: 8px;">
                  ${isBanked ? 'Linear Program Solver Result: BANK' : 'Transfer Move Found'}
                </span>
                <h1 style="font-size: 1.85rem; font-weight: 900; color: var(--text-primary); margin: 0; line-height: 1.2;">
                  ${isBanked ? 'Roll Transfer to Next Gameweek' : `Execute ${rec.transfers} Transfer(s)`}
                </h1>
                <p style="color: var(--text-secondary); margin-top: 6px; font-size: 0.92rem; max-width: 650px; line-height: 1.5;">
                  ${escapeHtml(rec.rationale || 'Bank free transfer: no move clears 1.0-point hurdle.')}
                </p>
              </div>

              <div style="display: flex; gap: 20px; align-items: center;">
                <div style="text-align: right;">
                  <span style="display: block; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Free Transfers</span>
                  <span style="font-size: 1.5rem; font-weight: 800; color: var(--fpl-cyan-neon);">${freeTransfers} FT</span>
                </div>
                <div style="text-align: right; border-left: 1px solid var(--border-color); padding-left: 20px;">
                  <span style="display: block; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Hurdle Bar</span>
                  <span style="font-size: 1.5rem; font-weight: 800; color: var(--fpl-magenta-neon);">&ge; ${threshold.toFixed(1)} pt</span>
                </div>
              </div>
            </div>

            <div style="margin-top: 16px; padding: 12px 14px; background: rgba(0,0,0,0.25); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.2rem;">💡</span>
              <span>
                <strong>Why Bank?</strong> In Fantasy Premier League, burning a free transfer on marginal expected gains (&lt; 1.0 pt) increases variance without statistical edge. Banking accumulates up to 5 free transfers, enabling powerful multi-transfer mini-wildcards during fixture swings.
              </span>
            </div>
          </div>

          <!-- Visual Threshold Hurdle Chart -->
          <div class="threshold-chart-card">
            <div class="card-header" style="margin-bottom: 8px;">
              <div>
                <span class="card-title">
                  Transfer Gain vs. 1.0-Point Minimum Hurdle
                </span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">
                  The optimizer scores the starting XI + captain only, subtracting 4 points per hit.
                </span>
              </div>
              <span class="badge badge-magenta">Hurdle = 1.00 pt</span>
            </div>

            <div class="threshold-bar-wrapper">
              <!-- Vertical Dashed Line at Hurdle -->
              <div class="threshold-hurdle-line" style="left: calc(140px + ${hurdlePct}% * 0.75);">
                <span class="threshold-hurdle-tag">1.00 pt Hurdle</span>
              </div>

              ${barsHtml}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 16px; margin-top: 14px; font-size: 0.76rem; color: var(--text-muted);">
              <span style="display: inline-flex; align-items: center; gap: 6px;">
                <span style="width: 12px; height: 12px; border-radius: 2px; background: var(--fpl-green-neon);"></span> Clears Hurdle
              </span>
              <span style="display: inline-flex; align-items: center; gap: 6px;">
                <span style="width: 12px; height: 12px; border-radius: 2px; background: #6b7280;"></span> Below Hurdle
              </span>
              <span style="display: inline-flex; align-items: center; gap: 6px;">
                <span style="width: 12px; height: 12px; border-radius: 2px; background: var(--fpl-magenta-neon);"></span> Net Negative (Hit Cost)
              </span>
            </div>
          </div>

          <!-- Evaluated Moves Detail Section -->
          <div>
            <div style="margin-bottom: 16px;">
              <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                All Evaluated Transfer Moves (LP Solutions)
              </h2>
              <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                Best squad found by the linear programming solver within N roster changes. Click any player to inspect metrics.
              </p>
            </div>

            ${tradesDetailHtml}
          </div>
        </div>
      `;

    } catch (err) {
      console.error('Error rendering Transfers page:', err);
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px;">
          <p style="color: var(--fpl-magenta-neon); font-weight: 700;">Failed to load transfer solutions</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 6px;">${escapeHtml(err.message)}</p>
          <button onclick="window.location.reload()" style="margin-top: 14px; padding: 8px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer;">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  // Export to window
  window.renderTransfersPage = renderTransfers;
})();

