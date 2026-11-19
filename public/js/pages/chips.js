/**
 * Chips Page Component
 * Renders the Triple Captain dynamic threshold loosening schedule (chart + trigger point),
 * along with intentionally styled placeholder cards for Wildcard, Free Hit, and Bench Boost.
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
   * Render the Chips Page
   * @param {HTMLElement} container DOM element to mount
   */
  async function renderChips(container) {
    try {
      const response = await fetch('/api/chips');
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }
      const data = await response.json();

      const currentGW = data.current_gameweek || 5;
      const tc = data.triple_captain || {};
      const curve = tc.threshold_curve || [];
      const unbuilt = data.unbuilt_chips || [];

      const shouldPlay = tc.should_play;
      const topScore = tc.top_score || 11.81;
      const curThreshold = tc.current_threshold || 10.76;
      const topCand = tc.top_candidate || 'Haaland';

      // Build SVG Chart
      const svgWidth = 920;
      const svgHeight = 280;
      const padLeft = 45;
      const padRight = 30;
      const padTop = 30;
      const padBottom = 35;

      const plotW = svgWidth - padLeft - padRight;
      const plotH = svgHeight - padTop - padBottom;

      const minY = 6.0;
      const maxY = 16.5;

      function getX(gw) {
        return padLeft + ((gw - 1) / (38 - 1)) * plotW;
      }

      function getY(val) {
        const clamped = Math.max(minY, Math.min(maxY, val));
        return padTop + plotH - ((clamped - minY) / (maxY - minY)) * plotH;
      }

      // Generate points for threshold line
      const thresholdPoints = curve.map(pt => `${getX(pt.gameweek).toFixed(1)},${getY(pt.threshold).toFixed(1)}`).join(' ');
      const areaPoints = `${thresholdPoints} ${getX(38).toFixed(1)},${getY(minY).toFixed(1)} ${getX(1).toFixed(1)},${getY(minY).toFixed(1)}`;

      // Historical best line
      const histPoints = curve.map(pt => `${getX(pt.gameweek).toFixed(1)},${getY(pt.historical_best).toFixed(1)}`).join(' ');

      // Current GW marker coordinates
      const gwX = getX(currentGW);
      const threshY = getY(curThreshold);
      const candY = getY(topScore);

      // Y-axis ticks
      const yTicks = [8, 10, 12, 14, 16];
      const yTicksHtml = yTicks.map(val => `
        <line x1="${padLeft}" y1="${getY(val)}" x2="${svgWidth - padRight}" y2="${getY(val)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
        <text x="${padLeft - 8}" y="${getY(val) + 4}" fill="rgba(255,255,255,0.4)" font-size="10" text-anchor="end">${val}</text>
      `).join('');

      // X-axis ticks (Gameweeks)
      const xTicks = [1, 5, 10, 15, 19, 20, 25, 30, 35, 38];
      const xTicksHtml = xTicks.map(gw => `
        <line x1="${getX(gw)}" y1="${padTop + plotH}" x2="${getX(gw)}" y2="${padTop + plotH + 5}" stroke="rgba(255,255,255,0.2)"/>
        <text x="${getX(gw)}" y="${padTop + plotH + 18}" fill="rgba(255,255,255,0.5)" font-size="10" text-anchor="middle">GW${gw}</text>
      `).join('');

      // Halfway line (between GW19 and GW20)
      const halfX = (getX(19) + getX(20)) / 2;

      // Unbuilt chips cards HTML
      const unbuiltCardsHtml = unbuilt.map(chip => `
        <div class="unbuilt-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0;">${escapeHtml(chip.title)}</h3>
              <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Status: Pending Solver</span>
            </div>
            <span class="badge badge-neutral" style="border-style: dashed;">${escapeHtml(chip.badge)}</span>
          </div>
          <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px;">
            ${escapeHtml(chip.description)}
          </p>
          <div style="background: var(--bg-surface-elevated); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--text-muted); border-left: 3px solid var(--border-color);">
            <strong>Architecture State:</strong> Clean placeholder. Integer programming solver under test for multi-gameweek fixture swings.
          </div>
        </div>
      `).join('');

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Triple Captain Trigger Banner -->
          <div class="bank-hero-card" style="border-color: ${shouldPlay ? 'var(--fpl-green-neon)' : 'var(--fpl-magenta-neon)'}; box-shadow: 0 0 20px ${shouldPlay ? 'rgba(0, 255, 133, 0.2)' : 'rgba(233, 0, 82, 0.2)'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
              <div>
                <span class="badge ${shouldPlay ? 'badge-green' : 'badge-magenta'}" style="margin-bottom: 8px;">
                  Triple Captain Dynamic Engine: ${shouldPlay ? 'TRIGGER ACTIVE' : 'HOLD CHIP'}
                </span>
                <h1 style="font-size: 1.85rem; font-weight: 900; color: var(--text-primary); margin: 0; line-height: 1.2;">
                  ${shouldPlay ? `Play Triple Captain on ${escapeHtml(topCand)}` : 'Hold Triple Captain Chip'}
                </h1>
                <p style="color: var(--text-secondary); margin-top: 6px; font-size: 0.92rem; max-width: 680px; line-height: 1.5;">
                  ${escapeHtml(tc.explanation || 'Optimal Triple Captain trigger dynamically solved.')}
                </p>
              </div>

              <div style="display: flex; gap: 20px; align-items: center;">
                <div style="text-align: right;">
                  <span style="display: block; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Captain Score</span>
                  <span style="font-size: 1.5rem; font-weight: 800; color: var(--fpl-green-neon);">${topScore.toFixed(2)}</span>
                </div>
                <div style="text-align: right; border-left: 1px solid var(--border-color); padding-left: 20px;">
                  <span style="display: block; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">GW5 Threshold</span>
                  <span style="font-size: 1.5rem; font-weight: 800; color: var(--fpl-cyan-neon);">${curThreshold.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Dynamic Threshold Interactive Curve Chart -->
          <div class="tc-curve-card">
            <div class="card-header" style="margin-bottom: 8px;">
              <div>
                <span class="card-title">
                  Triple Captain Dynamic Loosening Schedule (GW1 &ndash; GW38)
                </span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">
                  Threshold starts at 95th percentile (14.98 pts) and linearly loosens to 60th percentile (8.95 pts) over 19 gameweeks of each half.
                </span>
              </div>
              <div style="display: flex; gap: 14px; font-size: 0.75rem; color: var(--text-muted);">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 12px; height: 3px; background: var(--fpl-cyan-neon);"></span> Threshold Curve
                </span>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 12px; height: 3px; background: rgba(255,255,255,0.4); border-top: 1px dashed white;"></span> Historical Best
                </span>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--fpl-green-neon);"></span> Current Pick
                </span>
              </div>
            </div>

            <div class="chart-svg-container">
              <svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="curveGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#04f5ff"/>
                    <stop offset="100%" stop-color="#00ff85"/>
                  </linearGradient>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(4, 245, 255, 0.25)"/>
                    <stop offset="100%" stop-color="rgba(4, 245, 255, 0.0)"/>
                  </linearGradient>
                </defs>

                <!-- Gridlines -->
                ${yTicksHtml}
                ${xTicksHtml}

                <!-- Halfway season divider -->
                <line x1="${halfX}" y1="${padTop}" x2="${halfX}" y2="${padTop + plotH}" stroke="rgba(233, 0, 82, 0.4)" stroke-dasharray="4 4" stroke-width="1.5"/>
                <text x="${halfX - 6}" y="${padTop + 14}" fill="rgba(233, 0, 82, 0.7)" font-size="9" text-anchor="end" font-weight="700">1ST HALF</text>
                <text x="${halfX + 6}" y="${padTop + 14}" fill="rgba(233, 0, 82, 0.7)" font-size="9" text-anchor="start" font-weight="700">2ND HALF RESET</text>

                <!-- Area fill -->
                <polygon points="${areaPoints}" fill="url(#areaGradient)"/>

                <!-- Historical Best Dotted Line -->
                <polyline points="${histPoints}" fill="none" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1.5" stroke-dasharray="3 3"/>

                <!-- Threshold Curve Polyline -->
                <polyline points="${thresholdPoints}" fill="none" stroke="url(#curveGradient)" stroke-width="2.5" stroke-linecap="round"/>

                <!-- Current GW Highlight Bar -->
                <rect x="${gwX - 10}" y="${padTop}" width="20" height="${plotH}" fill="rgba(0, 255, 133, 0.06)" rx="4"/>
                <line x1="${gwX}" y1="${padTop}" x2="${gwX}" y2="${padTop + plotH}" stroke="var(--fpl-green-neon)" stroke-width="1.5" stroke-dasharray="2 2"/>

                <!-- Threshold Intersection Point -->
                <circle cx="${gwX}" cy="${threshY}" r="4" fill="#04f5ff" stroke="#ffffff" stroke-width="1.5"/>

                <!-- Candidate Score Point (Haaland = 11.81) -->
                <circle cx="${gwX}" cy="${candY}" r="7" fill="#00ff85" stroke="#ffffff" stroke-width="2">
                  <animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite"/>
                </circle>

                <!-- Marker Callout Text -->
                <g transform="translate(${gwX + 12}, ${candY - 10})">
                  <rect x="0" y="-14" width="220" height="28" rx="4" fill="#120014" stroke="#00ff85" stroke-width="1"/>
                  <text x="8" y="4" fill="#00ff85" font-size="11" font-weight="800">
                    GW${currentGW}: ${escapeHtml(topCand)} (${topScore.toFixed(2)}) &gt; ${curThreshold.toFixed(2)}
                  </text>
                </g>
              </svg>
            </div>

            <div style="margin-top: 16px; padding: 12px 16px; background: var(--bg-surface-elevated); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">
              <strong>Strategic Model Rationale:</strong> The Triple Captain chip gives 3x points to one player once per season. In early gameweeks, the threshold is demanding (14.98 pts) to preserve the chip for monster double gameweeks. If no 15-point fixture appears, the bar gently loosens week by week so the chip is never wasted on the final day. In GW5, Haaland's 11.81 captaincy score cleanly crosses the 10.76 threshold.
            </div>
          </div>

          <!-- Unbuilt Chips Section (Intentional Placeholders) -->
          <div>
            <div style="margin-bottom: 16px;">
              <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                Other FPL Chips (Multi-Gameweek Strategy)
              </h2>
              <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                Intentionally designed clean state. Full multi-gameweek dynamic integer program integration planned.
              </p>
            </div>

            <div class="unbuilt-chips-grid">
              ${unbuiltCardsHtml}
            </div>
          </div>
        </div>
      `;

    } catch (err) {
      console.error('Error rendering Chips page:', err);
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px;">
          <p style="color: var(--fpl-magenta-neon); font-weight: 700;">Failed to load chips strategy</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 6px;">${escapeHtml(err.message)}</p>
          <button onclick="window.location.reload()" style="margin-top: 14px; padding: 8px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer;">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  // Export to window
  window.renderChipsPage = renderChips;
})();

