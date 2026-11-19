/**
 * Captaincy Page Component
 * Renders the ranked captaincy candidates with stacked bar breakdown
 * decomposed into: base predicted points, goal threat bonus, and fixture difficulty factor.
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
   * Render the Captaincy Page
   * @param {HTMLElement} container DOM element to mount
   */
  async function renderCaptaincy(container) {
    try {
      const response = await fetch('/api/captaincy');
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }
      const data = await response.json();

      const cap = data.suggested_captain || {};
      const vc = data.suggested_vice_captain || {};
      const candidates = data.candidates || [];

      // Find max score for relative scaling of stacked bars
      const maxScore = Math.max(12, ...candidates.map(c => c.captaincy_score || 0));

      const rowsHtml = candidates.map((cand, idx) => {
        const isCap = cand.fpl_id === cap.fpl_id;
        const isVC = cand.fpl_id === vc.fpl_id;

        const basePts = Math.max(0, cand.predicted_points || 0);
        const threatPts = Math.max(0, cand.goal_threat_bonus || 0);
        const fixturePts = cand.fixture_bonus || 0;
        const totalScore = cand.captaincy_score || 0;

        // Proportions
        const baseWidthPct = (basePts / maxScore) * 100;
        const threatWidthPct = (threatPts / maxScore) * 100;
        const fixtureWidthPct = Math.max(0, (fixturePts / maxScore) * 100);

        let armbandTag = '';
        if (isCap) {
          armbandTag = `<span class="armband-badge armband-captain" style="position:static; display:inline-flex; width:22px; height:22px;" title="Suggested Captain">C</span>`;
        } else if (isVC) {
          armbandTag = `<span class="armband-badge armband-vice" style="position:static; display:inline-flex; width:22px; height:22px;" title="Suggested Vice Captain">V</span>`;
        }

        const fdrBadge = window.renderFDRBadge ? window.renderFDRBadge(cand.fixture_difficulty) : cand.fixture_difficulty;

        return `
          <tr>
            <td style="width: 40px; text-align: center; font-weight: 800; color: var(--text-muted);">
              #${idx + 1}
            </td>
            <td style="width: 32px; text-align: center;">
              ${armbandTag}
            </td>
            <td style="min-width: 160px;">
              <div>
                <strong style="color: var(--text-primary); cursor: pointer; font-size: 0.95rem;" 
                        onclick="window.openPlayerModal('${escapeHtml(cand.web_name)}', '${escapeHtml(cand.team)}')">
                  ${escapeHtml(cand.web_name)}
                </strong>
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                  ${escapeHtml(cand.position)} &bull; ${escapeHtml(cand.team)} &bull; &pound;${(cand.price || 0).toFixed(1)}m
                </div>
              </div>
            </td>
            <td style="text-align: center; width: 60px;">
              ${fdrBadge}
            </td>
            <!-- Stacked Bar Column -->
            <td style="min-width: 280px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <div class="stacked-bar-container" title="Base: ${basePts.toFixed(2)} | Threat: +${threatPts.toFixed(2)} | Fixture: ${fixturePts >= 0 ? '+' : ''}${fixturePts.toFixed(2)}">
                  <div class="stacked-seg-points" style="width: ${baseWidthPct}%;"></div>
                  <div class="stacked-seg-threat" style="width: ${threatWidthPct}%;"></div>
                  ${fixtureWidthPct > 0 ? `<div class="stacked-seg-fixture" style="width: ${fixtureWidthPct}%;"></div>` : ''}
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted);">
                  <span>Base: ${basePts.toFixed(2)}</span>
                  <span>Threat: +${threatPts.toFixed(2)}</span>
                  <span>Fix: ${fixturePts >= 0 ? '+' : ''}${fixturePts.toFixed(2)}</span>
                </div>
              </div>
            </td>
            <!-- Total Score -->
            <td style="text-align: right; width: 90px;">
              <span class="badge ${isCap ? 'badge-green' : 'badge-neutral'}" style="font-size: 0.9rem; padding: 4px 10px;">
                ${totalScore.toFixed(2)}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Top Armband Recommendations Split -->
          <div class="captaincy-hero-split">
            <!-- Captain -->
            <div class="card headline-card card-captain">
              <div class="card-header">
                <span class="card-title">
                  <span class="armband-badge armband-captain" style="position:static; display:inline-flex;">C</span>
                  Suggested Captain (Double Points)
                </span>
                <span class="badge badge-green">Top Ranked</span>
              </div>
              <div class="headline-hero">
                <span class="headline-name">${escapeHtml(cap.web_name || 'Haaland')}</span>
                <span class="headline-score">${(cap.captaincy_score || 11.81).toFixed(2)}</span>
              </div>
              <div class="headline-sub">
                ${escapeHtml(cap.team || 'Man City')} &bull; ${escapeHtml(cap.position || 'FWD')} &bull; &pound;${(cap.price || 15.5).toFixed(1)}m
              </div>
              <div class="headline-rationale">
                <strong>Model Breakdown:</strong> Base prediction ${(cap.predicted_points || 10.31).toFixed(2)} pts + Goal threat bonus +${(cap.goal_threat_bonus || 1.5).toFixed(2)} pts (1.00 goals/game avg last 5). Clear statistical standout for the armband.
              </div>
            </div>

            <!-- Vice Captain -->
            <div class="card headline-card" style="border-top-color: var(--fpl-magenta-neon);">
              <div class="card-header">
                <span class="card-title">
                  <span class="armband-badge armband-vice" style="position:static; display:inline-flex;">V</span>
                  Suggested Vice Captain (Safety Shield)
                </span>
                <span class="badge badge-magenta">Vice Pick</span>
              </div>
              <div class="headline-hero">
                <span class="headline-name">${escapeHtml(vc.web_name || 'João Pedro')}</span>
                <span class="headline-score" style="color: var(--fpl-magenta-neon);">${(vc.captaincy_score || 6.03).toFixed(2)}</span>
              </div>
              <div class="headline-sub">
                ${escapeHtml(vc.team || 'Chelsea')} &bull; ${escapeHtml(vc.position || 'FWD')} &bull; &pound;${(vc.price || 7.8).toFixed(1)}m
              </div>
              <div class="headline-rationale">
                <strong>Model Breakdown:</strong> Base prediction ${(vc.predicted_points || 4.93).toFixed(2)} pts + Goal threat bonus +${(vc.goal_threat_bonus || 1.1).toFixed(2)} pts (0.74 goals/game avg). Safeguards points if the primary captain doesn't play.
              </div>
            </div>
          </div>

          <!-- Formula Explainer Box -->
          <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;">
              <span style="font-weight: 800; font-size: 0.95rem; color: var(--text-primary);">
                Captaincy Composite Objective Function
              </span>
              <!-- Stacked Legend -->
              <div style="display: flex; gap: 16px; font-size: 0.74rem; color: var(--text-muted);">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 12px; height: 12px; border-radius: 2px; background: var(--fpl-green-neon);"></span> Base Predicted Points
                </span>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 12px; height: 12px; border-radius: 2px; background: var(--fpl-cyan-neon);"></span> Goal Threat Bonus (Goals/90 &times; 1.5)
                </span>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 12px; height: 12px; border-radius: 2px; background: var(--fpl-magenta-neon);"></span> Fixture Difficulty Factor
                </span>
              </div>
            </div>
            <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; margin: 0;">
              <code>Captaincy Score = Base Prediction + (Goals Scored Avg Last 5 &times; 1.5) + Fixture Difficulty Bonus</code>. 
              Captain points are doubled in FPL, so the model places extra weight on non-linear explosive upside (goal threat and favorable home/away matchups).
            </p>
          </div>

          <!-- Stacked Bar Candidates Table -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">
                Ranked Candidates &amp; Stacked Breakdown (${candidates.length} Starting XI Candidates)
              </span>
              <span class="badge badge-neutral">Gameweek 5 Solved</span>
            </div>

            <div style="overflow-x: auto;">
              <table class="captain-table">
                <thead>
                  <tr>
                    <th style="text-align: center;">Rank</th>
                    <th style="text-align: center;">Band</th>
                    <th>Candidate</th>
                    <th style="text-align: center;">FDR</th>
                    <th>Score Component Breakdown (Stacked Bars)</th>
                    <th style="text-align: right;">Total Score</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

    } catch (err) {
      console.error('Error rendering Captaincy page:', err);
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px;">
          <p style="color: var(--fpl-magenta-neon); font-weight: 700;">Failed to load captaincy rankings</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 6px;">${escapeHtml(err.message)}</p>
          <button onclick="window.location.reload()" style="margin-top: 14px; padding: 8px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer;">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  // Export to window
  window.renderCaptaincyPage = renderCaptaincy;
})();

