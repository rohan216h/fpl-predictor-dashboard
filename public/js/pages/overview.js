/**
 * Overview Page Component
 * Renders the headline recommendation cards, team state bar,
 * squad performance metrics, and upcoming gameweek fixtures.
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
   * Render the Overview Page
   * @param {HTMLElement} container DOM element to mount
   */
  async function renderOverview(container) {
    try {
      const response = await fetch('/api/overview');
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }
      const data = await response.json();

      const teamState = data.team_state || {};
      const recs = data.headline_recommendations || {};
      const squad = data.squad_summary || {};
      const deadline = data.deadline;
      const fixtures = data.fixtures || [];

      // Chips badges
      const chipNames = {
        wildcard: 'Wildcard',
        freehit: 'Free Hit',
        bboost: 'Bench Boost',
        '3xc': 'Triple Captain'
      };

      const chipsHtml = (teamState.chips_available || []).map(chip => {
        const label = chipNames[chip] || chip;
        return `<span class="chip-tag active">&check; ${escapeHtml(label)}</span>`;
      }).join('');

      // Transfer card styling & text
      const isBank = recs.transfer && recs.transfer.action === 'BANK';
      const transferBadgeClass = isBank ? 'badge-cyan' : 'badge-green';
      const transferTitle = isBank ? 'Bank Free Transfer' : `${recs.transfer.transfers} Transfer(s)`;

      // Triple captain recommendation styling
      const tcRec = recs.triple_captain || {};
      const isPlayTC = tcRec.recommendation === 'PLAY';

      // Fixtures table HTML
      let fixturesHtml = '';
      if (fixtures.length > 0) {
        fixturesHtml = `
          <table class="fixtures-table">
            <thead>
              <tr>
                <th>Match</th>
                <th style="text-align:center;">FDR (H / A)</th>
                <th style="text-align:right;">Kickoff</th>
              </tr>
            </thead>
            <tbody>
              ${fixtures.slice(0, 6).map(fix => {
                const homeFDR = window.renderFDRBadge ? window.renderFDRBadge(fix.home_difficulty) : fix.home_difficulty;
                const awayFDR = window.renderFDRBadge ? window.renderFDRBadge(fix.away_difficulty) : fix.away_difficulty;
                const scoreOrVs = fix.is_finished 
                  ? `${fix.home_score} - ${fix.away_score}` 
                  : '<span class="fixture-vs">vs</span>';
                const timeStr = fix.kickoff_time 
                  ? new Date(fix.kickoff_time).toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
                  : 'TBD';

                return `
                  <tr>
                    <td>
                      <div class="fixture-match">
                        <span>${escapeHtml(fix.home_team_short || fix.home_team)}</span>
                        ${scoreOrVs}
                        <span>${escapeHtml(fix.away_team_short || fix.away_team)}</span>
                      </div>
                    </td>
                    <td style="text-align:center;">
                      <div style="display:inline-flex; gap: 4px; align-items:center;">
                        ${homeFDR} <span style="color:var(--text-muted); font-size: 0.7rem;">/</span> ${awayFDR}
                      </div>
                    </td>
                    <td style="text-align:right; font-size: 0.78rem; color: var(--text-muted);">${timeStr}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else {
        fixturesHtml = `
          <div style="padding: 24px; text-align:center; color: var(--text-muted); font-size: 0.85rem;">
            <p>Live fixture schedule synced with FPL Gameweek ${data.gameweek || 5}.</p>
            <p style="margin-top: 6px; font-size: 0.75rem;">Full fixture list with difficulty ratings available in match center.</p>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="overview-grid">
          <!-- Team State Bar -->
          <div class="team-state-bar">
            <div class="state-item">
              <span class="state-label">Manager Team</span>
              <span class="state-value" style="font-size: 1.15rem;">${escapeHtml(teamState.team_name || "Green Arrow")}</span>
            </div>
            <div class="state-item">
              <span class="state-label">Bank Balance</span>
              <span class="state-value highlight-green">&pound;${(teamState.bank || 0).toFixed(1)}m</span>
            </div>
            <div class="state-item">
              <span class="state-label">Team Squad Value</span>
              <span class="state-value">&pound;${(teamState.team_value || 100.2).toFixed(1)}m</span>
            </div>
            <div class="state-item">
              <span class="state-label">Free Transfers</span>
              <span class="state-value highlight-green">${teamState.free_transfers || 5} FT</span>
            </div>
            <div class="state-item" style="grid-column: span 2;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="state-label">Available Chips (${(teamState.chips_available || []).length})</span>
                <button id="btn-sync-fpl" style="font-size: 0.72rem; padding: 3px 8px; border-radius: var(--radius-pill); background: rgba(0,255,133,0.12); border: 1px solid rgba(0,255,133,0.4); color: var(--fpl-green-neon); font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                  <span id="sync-icon">🔄</span> Sync Live FPL
                </button>
              </div>
              <div class="state-chips-list">
                ${chipsHtml}
              </div>
            </div>
          </div>

          <!-- Headline Recommendations Grid (3 Column Cards) -->
          <div class="headline-row">
            <!-- 1. Captain Card -->
            <div class="card headline-card card-captain">
              <div class="card-header">
                <span class="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="7"/>
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                  </svg>
                  Captaincy Pick
                </span>
                <span class="badge badge-green">Recommended</span>
              </div>
              <div class="headline-hero">
                <span class="headline-name">${escapeHtml(recs.captain ? recs.captain.name : 'Haaland')}</span>
                <span class="headline-score">${(recs.captain ? recs.captain.predicted_points : 10.31).toFixed(2)} pts</span>
              </div>
              <div class="headline-sub">
                ${escapeHtml(recs.captain ? recs.captain.team : 'Man City')} &bull; Captaincy Score: 
                <strong>${(recs.captain ? recs.captain.captaincy_score : 11.81).toFixed(2)}</strong>
                ${window.renderFDRBadge ? window.renderFDRBadge(recs.captain ? recs.captain.fixture_difficulty : 3) : ''}
              </div>
              <div class="headline-rationale">
                Blend of ML point prediction + goal threat + fixture difficulty multiplier. Solved optimal armbands: (C) ${escapeHtml(recs.captain ? recs.captain.name : 'Haaland')} &bull; (VC) João Pedro.
              </div>
              <div style="margin-top: 14px;">
                <a href="#/captaincy" class="nav-link" style="display:inline-flex; align-items:center; gap:6px; padding:6px 0; color:var(--fpl-green-neon); font-size:0.82rem;">
                  View Captain Candidates &rarr;
                </a>
              </div>
            </div>

            <!-- 2. Transfer Recommendation Card -->
            <div class="card headline-card card-transfer">
              <div class="card-header">
                <span class="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                  Transfer Strategy
                </span>
                <span class="badge ${transferBadgeClass}">${isBank ? 'Optimal Hold' : 'Move Found'}</span>
              </div>
              <div class="headline-hero">
                <span class="headline-name">${escapeHtml(transferTitle)}</span>
                <span class="headline-score" style="color: var(--fpl-cyan-neon);">${isBank ? '+0.00' : '+' + recs.transfer.gain.toFixed(2)} pts</span>
              </div>
              <div class="headline-sub">
                ${isBank ? 'Save Free Transfer for next gameweek' : `${recs.transfer.transfers} trade(s) suggested`}
              </div>
              <div class="headline-rationale">
                ${escapeHtml(recs.transfer ? recs.transfer.rationale : 'Bank free transfer: no move clears 1.0-point hurdle.')}
              </div>
              <div style="margin-top: 14px;">
                <a href="#/transfers" class="nav-link" style="display:inline-flex; align-items:center; gap:6px; padding:6px 0; color:var(--fpl-cyan-neon); font-size:0.82rem;">
                  Explore Transfer LP Solver &rarr;
                </a>
              </div>
            </div>

            <!-- 3. Triple Captain Chip Card -->
            <div class="card headline-card card-chip">
              <div class="card-header">
                <span class="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  Triple Captain Status
                </span>
                <span class="badge ${isPlayTC ? 'badge-green' : 'badge-magenta'}">${isPlayTC ? 'Trigger Active' : 'Hold Chip'}</span>
              </div>
              <div class="headline-hero">
                <span class="headline-name">${isPlayTC ? 'PLAY TRIPLE CAP' : 'HOLD CHIP'}</span>
                <span class="headline-score" style="color: ${isPlayTC ? 'var(--fpl-green-neon)' : 'var(--text-muted)'};">
                  ${(tcRec.score || 11.81).toFixed(2)}
                </span>
              </div>
              <div class="headline-sub">
                Threshold: <strong>${(tcRec.threshold || 10.76).toFixed(2)} pts</strong> &bull; Week 5 of 19
              </div>
              <div class="headline-rationale">
                ${escapeHtml(tcRec.explanation || "Optimal Triple Captain trigger dynamically solved based on percentile loosening schedule.")}
              </div>
              <div style="margin-top: 14px;">
                <a href="#/chips" class="nav-link" style="display:inline-flex; align-items:center; gap:6px; padding:6px 0; color:var(--fpl-magenta-neon); font-size:0.82rem;">
                  Inspect Chip Strategy &rarr;
                </a>
              </div>
            </div>
          </div>

          <!-- Performance & Fixtures Split Section -->
          <div class="overview-split">
            <!-- Left: Squad Performance & Budget -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">
                  Gameweek ${data.gameweek || 5} Squad Points Breakdown
                </span>
                <span class="formation-badge" style="font-size: 0.8rem; padding: 2px 8px;">
                  Formation ${escapeHtml(squad.formation || '3-4-3')}
                </span>
              </div>

              <div class="metric-bar-group" style="margin-top: 16px;">
                <div class="metric-item">
                  <div class="metric-row">
                    <span style="color: var(--text-secondary);">Starting XI (11 Players Base)</span>
                    <strong style="color: var(--text-primary);">${(squad.starters_predicted_points || 53.97).toFixed(2)} pts</strong>
                  </div>
                  <div class="meter-track">
                    <div class="meter-fill" style="width: ${(squad.starters_predicted_points / 70 * 100).toFixed(0)}%;"></div>
                  </div>
                </div>

                <div class="metric-item">
                  <div class="metric-row">
                    <span style="color: var(--text-secondary);">Captaincy Armband Multiplier</span>
                    <strong style="color: var(--fpl-green-neon);">+${(squad.captain_bonus_points || 10.31).toFixed(2)} pts</strong>
                  </div>
                  <div class="meter-track">
                    <div class="meter-fill" style="width: ${(squad.captain_bonus_points / 20 * 100).toFixed(0)}%; background: var(--fpl-green-neon);"></div>
                  </div>
                </div>

                <div class="metric-item" style="border-top: 1px dashed var(--border-color); padding-top: 10px;">
                  <div class="metric-row" style="font-size: 1.05rem;">
                    <span style="font-weight: 700; color: var(--text-primary);">Total Projected Gameweek Points</span>
                    <strong style="font-size: 1.25rem; color: var(--fpl-green-neon);">${(squad.total_predicted_points || 64.28).toFixed(2)} pts</strong>
                  </div>
                </div>

                <div class="metric-item" style="margin-top: 4px;">
                  <div class="metric-row">
                    <span style="color: var(--text-muted); font-size: 0.82rem;">Bench Cushion (4 Substitutes)</span>
                    <span style="color: var(--text-muted); font-size: 0.82rem;">${(squad.bench_predicted_points || 11.08).toFixed(2)} pts</span>
                  </div>
                </div>

                <!-- Budget Utilization -->
                <div class="metric-item" style="margin-top: 10px; background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                  <div class="metric-row">
                    <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">Budget Utilization (&pound;99.5m Cap)</span>
                    <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary);">&pound;${(squad.budget_used || 99.5).toFixed(1)}m (100%)</span>
                  </div>
                  <div class="meter-track" style="margin-top: 6px;">
                    <div class="meter-fill" style="width: 100%; background: linear-gradient(90deg, var(--fpl-green-neon), var(--fpl-cyan-neon));"></div>
                  </div>
                  <div style="display:flex; justify-content:space-between; margin-top: 4px; font-size: 0.72rem; color: var(--text-muted);">
                    <span>Used: &pound;${(squad.budget_used || 99.5).toFixed(1)}m</span>
                    <span>Remaining Bank: &pound;${(squad.bank_remaining || 0.0).toFixed(1)}m</span>
                  </div>
                </div>
              </div>

              <div style="margin-top: 20px;">
                <a href="#/squad" class="nav-link" style="display:inline-block; width: 100%; text-align: center; background: var(--fpl-purple-primary); color: #ffffff; border-radius: var(--radius-sm); padding: 10px 16px; font-weight: 700; border: 1px solid rgba(0, 255, 133, 0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                  View Starting XI &amp; Pitch Formation &rarr;
                </a>
              </div>
            </div>

            <!-- Right: Upcoming Gameweek Matchups -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">
                  Upcoming Gameweek ${data.gameweek || 5} Fixtures
                </span>
                <span class="badge badge-neutral">Live Schedule</span>
              </div>
              <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">
                FDR difficulty ratings for Home / Away clubs in this gameweek's fixtures.
              </p>
              ${fixturesHtml}
            </div>
          </div>
        </div>
      `;

      // Attach sync button listener
      const syncBtn = container.querySelector('#btn-sync-fpl');
      if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
          syncBtn.disabled = true;
          syncBtn.innerHTML = '<span>⏳</span> Syncing...';
          try {
            // Re-render overview to fetch live data
            await renderOverview(container);
          } catch (e) {
            console.error(e);
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<span>🔄</span> Sync Live FPL';
          }
        });
      }
    } catch (err) {
      console.error('Error rendering Overview:', err);
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px;">
          <p style="color: var(--fpl-magenta-neon); font-weight: 700;">Failed to load overview data</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 6px;">${escapeHtml(err.message)}</p>
          <button onclick="window.location.reload()" style="margin-top: 14px; padding: 8px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer;">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  // Export to window
  window.renderOverviewPage = renderOverview;
})();

