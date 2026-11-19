/**
 * Squad Page Component
 * Renders the 15-man squad on the pitch graphic with starting XI formation,
 * bench shelf, and team allocation constraints.
 */

(function () {
  'use strict';

  /**
   * Render the Squad Page
   * @param {HTMLElement} container DOM element to mount
   */
  async function renderSquad(container) {
    try {
      const response = await fetch('/api/squad');
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }
      const squadData = await response.json();

      // Render the pitch view component
      if (typeof window.renderPitchView === 'function') {
        container.innerHTML = window.renderPitchView(squadData);
      } else {
        container.innerHTML = `<div class="card"><p style="color:var(--fpl-magenta-neon);">Pitch component not loaded.</p></div>`;
      }

      // Attach click listeners to player cards (starting XI + bench)
      const playerCards = container.querySelectorAll('.pitch-card');
      playerCards.forEach(card => {
        card.addEventListener('click', () => {
          const name = card.getAttribute('data-player-name');
          const team = card.getAttribute('data-player-team');
          const id = card.getAttribute('data-player-id');
          if (typeof window.openPlayerModal === 'function') {
            window.openPlayerModal(name, team, id);
          }
        });

        // Keyboard accessibility
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
          }
        });
      });

    } catch (err) {
      console.error('Error rendering Squad:', err);
      container.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px;">
          <p style="color: var(--fpl-magenta-neon); font-weight: 700;">Failed to load squad lineup</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 6px;">${err.message}</p>
          <button onclick="window.location.reload()" style="margin-top: 14px; padding: 8px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer;">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  // Export to window
  window.renderSquadPage = renderSquad;
})();

