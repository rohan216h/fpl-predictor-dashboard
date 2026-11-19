/**
 * Football Pitch & Squad Visualizer Component
 * Renders starting XI formation on an authentic FPL pitch with bench shelf
 * and club allocation constraint badges.
 */

(function () {
  'use strict';

  // SVG Jersey Icon template with dynamic primary color
  function getJerseySVG(position) {
    const isGK = position === 'GKP';
    const fill1 = isGK ? '#ffdd00' : '#00ff85';
    const fill2 = isGK ? '#cc9900' : '#04f5ff';
    return `
      <svg class="jersey-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 6L6 14L10 18L13 14V34H27V14L30 18L34 14L26 6C24 10 16 10 14 6Z" fill="${fill1}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
        <path d="M16 6C17 9 23 9 24 6H16Z" fill="${fill2}"/>
        <path d="M13 14L10 18L6 14L14 6L16 6C16 8 24 8 24 6L26 6L34 14L30 18L27 14" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="1 1"/>
      </svg>
    `;
  }

  /**
   * Render single pitch player card
   */
  function renderPlayerCard(player, isBench = false) {
    const isCap = player.is_captain;
    const isVC = player.is_vice_captain;
    const fdrHtml = window.renderFDRBadge ? window.renderFDRBadge(player.fixture_difficulty) : '';
    const pointsFormatted = (player.predicted_points || 0).toFixed(2);
    const priceFormatted = (player.price || 0).toFixed(1);

    let armband = '';
    if (isCap) {
      armband = `<span class="armband-badge armband-captain" title="Captain (2x Points)">C</span>`;
    } else if (isVC) {
      armband = `<span class="armband-badge armband-vice" title="Vice Captain">V</span>`;
    }

    return `
      <div class="pitch-card ${isCap ? 'is-captain' : ''} ${isVC ? 'is-vice' : ''}" 
           data-player-name="${escapeHtml(player.web_name)}"
           data-player-team="${escapeHtml(player.team)}"
           data-player-id="${player.fpl_id}"
           role="button"
           tabindex="0"
           aria-label="${escapeHtml(player.web_name)} (${player.position}), predicted ${pointsFormatted} points">
        <div class="card-jersey-wrap">
          ${getJerseySVG(player.position)}
          ${armband}
        </div>
        <div class="card-info-box">
          <span class="card-player-name">${escapeHtml(player.web_name)}</span>
          <div class="card-meta-row">
            <span class="card-team-price">${escapeHtml(player.team.substring(0, 3).toUpperCase())} &pound;${priceFormatted}m</span>
            <span class="card-points-badge">${pointsFormatted}</span>
          </div>
          <div style="display:flex; justify-content:center; padding: 2px 0 3px 0; background: rgba(0,0,0,0.4);">
            ${fdrHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Helper to escape HTML attributes & text
   */
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
   * Main pitch renderer
   * @param {Object} squadData The squad payload matching squad.json
   * @param {Function} [onPlayerClick] Optional callback when player is selected
   * @returns {string} HTML string
   */
  function renderPitchView(squadData, onPlayerClick) {
    if (!squadData || !squadData.starting_xi) {
      return `<div class="card"><p style="text-align:center; padding: 40px; color: var(--text-muted);">No squad data available.</p></div>`;
    }

    const starters = squadData.starting_xi;
    const bench = squadData.bench || [];

    // Group starting XI by position
    const gkp = starters.filter(p => p.position === 'GKP');
    const def = starters.filter(p => p.position === 'DEF');
    const mid = starters.filter(p => p.position === 'MID');
    const fwd = starters.filter(p => p.position === 'FWD');

    // Calculate totals
    const startersPts = starters.reduce((acc, p) => acc + (p.predicted_points || 0), 0);
    const capPlayer = starters.find(p => p.is_captain);
    const capBonus = capPlayer ? capPlayer.predicted_points : 0;
    const totalPtsWithCap = startersPts + capBonus;
    const benchPts = bench.reduce((acc, p) => acc + (p.predicted_points || 0), 0);

    // Team limits
    const dist = squadData.team_distribution || {};
    const teamChipsHtml = Object.entries(dist)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([team, count]) => {
        const isFull = count >= 3;
        return `
          <span class="team-limit-chip ${isFull ? 'full' : ''}" title="${team}: ${count}/3 players chosen">
            <span>${escapeHtml(team)}</span>
            <strong>${count}/3</strong>
          </span>
        `;
      }).join('');

    return `
      <div class="squad-view-container">
        <!-- Squad Header Metrics Bar -->
        <div class="squad-header-bar">
          <div class="squad-title-group">
            <span class="formation-badge">Formation ${escapeHtml(squadData.formation || '3-4-3')}</span>
            <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
              Linear Program Optimized Lineup
            </span>
          </div>
          <div class="squad-stats-group">
            <div class="squad-stat-item">
              <span class="stat-label">Starting XI Pred</span>
              <span class="stat-val">${startersPts.toFixed(2)} pts</span>
            </div>
            <div class="squad-stat-item">
              <span class="stat-label">Captain Bonus</span>
              <span class="stat-val green">+${capBonus.toFixed(2)} pts</span>
            </div>
            <div class="squad-stat-item">
              <span class="stat-label">Total Gameweek</span>
              <span class="stat-val green">${totalPtsWithCap.toFixed(2)} pts</span>
            </div>
            <div class="squad-stat-item">
              <span class="stat-label">Budget Used</span>
              <span class="stat-val">&pound;${(squadData.budget_used || 0).toFixed(1)}m / &pound;${(squadData.budget_cap || 99.5).toFixed(1)}m</span>
            </div>
          </div>
        </div>

        <!-- The Football Pitch Frame -->
        <div class="pitch-container">
          <div class="football-pitch">
            <!-- Pitch SVG Field Markings -->
            <svg class="pitch-markings" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">
              <!-- Pitch Boundary -->
              <rect x="20" y="20" width="560" height="760" rx="8" />
              <!-- Halfway Line -->
              <line x1="20" y1="400" x2="580" y2="400" />
              <!-- Center Circle -->
              <circle cx="300" cy="400" r="70" />
              <circle cx="300" cy="400" r="4" fill="rgba(255,255,255,0.25)" />
              
              <!-- Top Penalty Box (Goalkeeper & Defense) -->
              <rect x="150" y="20" width="300" height="120" />
              <rect x="220" y="20" width="160" height="45" />
              <path d="M 240 140 A 60 60 0 0 0 360 140" />
              <circle cx="300" cy="95" r="3" fill="rgba(255,255,255,0.25)" />

              <!-- Bottom Penalty Box (Attackers) -->
              <rect x="150" y="660" width="300" height="120" />
              <rect x="220" y="735" width="160" height="45" />
              <path d="M 240 660 A 60 60 0 0 1 360 660" />
              <circle cx="300" cy="705" r="3" fill="rgba(255,255,255,0.25)" />

              <!-- Corner Arcs -->
              <path d="M 20 40 A 20 20 0 0 0 40 20" />
              <path d="M 560 20 A 20 20 0 0 0 580 40" />
              <path d="M 20 760 A 20 20 0 0 1 40 780" />
              <path d="M 560 780 A 20 20 0 0 1 580 760" />
            </svg>

            <!-- Row 1: Goalkeeper -->
            <div class="pitch-row pitch-row-gkp">
              ${gkp.map(p => renderPlayerCard(p)).join('')}
            </div>

            <!-- Row 2: Defenders -->
            <div class="pitch-row pitch-row-def">
              ${def.map(p => renderPlayerCard(p)).join('')}
            </div>

            <!-- Row 3: Midfielders -->
            <div class="pitch-row pitch-row-mid">
              ${mid.map(p => renderPlayerCard(p)).join('')}
            </div>

            <!-- Row 4: Forwards -->
            <div class="pitch-row pitch-row-fwd">
              ${fwd.map(p => renderPlayerCard(p)).join('')}
            </div>
          </div>
        </div>

        <!-- Bench Shelf Container -->
        <div class="bench-shelf-container">
          <div class="bench-header">
            <span>Substitutes Bench (${bench.length} Players &bull; ${benchPts.toFixed(2)} Pred Pts)</span>
            <span style="font-weight: 500; font-size: 0.72rem; color: var(--text-muted);">Auto-substitution order: 1 &rarr; 2 &rarr; 3 &rarr; GK</span>
          </div>
          <div class="bench-cards-row">
            ${bench.map((p, idx) => `
              <div class="bench-card-wrapper">
                <span class="bench-priority-tag">${p.position === 'GKP' ? 'Sub GK' : `Sub ${p.bench_order || (idx + 1)}`}</span>
                ${renderPlayerCard(p, true)}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Team Limits Constraint Card -->
        <div class="team-limits-card">
          <div class="limits-header">
            <span>Team Allocation Constraint (Premier League Max 3 Rule)</span>
            <span class="badge badge-green">&check; Fully Compliant</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
            The PuLP optimizer strictly enforces &le; 3 players from any single Premier League club across the 15-man squad.
          </p>
          <div class="limits-tag-list">
            ${teamChipsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Export to window
  window.renderPitchView = renderPitchView;
})();

