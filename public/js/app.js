/**
 * FPL Predictor & Squad Optimizer — Main Application Script
 * Orchestrates client-side hash routing, theme toggling,
 * global deadline countdown ticker, and player detail modal drawer.
 */

(function () {
  'use strict';

  // DOM Elements
  const appContainer = document.getElementById('app');
  const pageLoader = document.getElementById('page-loader');
  const pageContent = document.getElementById('page-content');
  const navLinks = document.querySelectorAll('.nav-link');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const gameweekLabel = document.getElementById('gameweek-label');
  const deadlineCountdown = document.getElementById('deadline-countdown');
  const apiStatusDot = document.getElementById('api-status-dot');

  // Modal Elements
  const playerModal = document.getElementById('player-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalContent = document.getElementById('modal-content');

  /* ==========================================================================
     THEME TOGGLE LOGIC
     ========================================================================== */
  function initTheme() {
    const savedTheme = localStorage.getItem('fpl_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('fpl_theme', newTheme);
      });
    }
  }

  /* ==========================================================================
     GLOBAL HEADER & DEADLINE TICKER
     ========================================================================== */
  let deadlineTimer = null;

  async function initHeaderMeta() {
    try {
      const res = await fetch('/api/overview');
      if (!res.ok) return;
      const data = await res.json();

      if (gameweekLabel) {
        gameweekLabel.textContent = `GW${data.gameweek || 5} Live`;
      }

      if (apiStatusDot) {
        apiStatusDot.classList.add('live');
      }

      // Deadline countdown setup
      if (data.deadline && data.deadline.deadline_time) {
        startDeadlineCountdown(new Date(data.deadline.deadline_time));
      } else {
        if (deadlineCountdown) {
          deadlineCountdown.textContent = 'GW5 Active • Next: Sat 11:00';
        }
      }
    } catch (e) {
      console.warn('Could not fetch global header meta:', e);
      if (gameweekLabel) gameweekLabel.textContent = 'GW5 (Offline)';
      if (deadlineCountdown) deadlineCountdown.textContent = 'Sync fallback active';
      if (apiStatusDot) apiStatusDot.classList.remove('live');
    }
  }

  function startDeadlineCountdown(targetDate) {
    if (deadlineTimer) clearInterval(deadlineTimer);

    function update() {
      const now = new Date().getTime();
      const diff = targetDate.getTime() - now;

      if (!deadlineCountdown) return;

      if (diff <= 0) {
        deadlineCountdown.textContent = 'Gameweek In Progress';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        deadlineCountdown.textContent = `${days}d ${hours}h ${minutes}m to deadline`;
      } else {
        deadlineCountdown.textContent = `${hours}h ${minutes}m ${seconds}s to deadline`;
      }
    }

    update();
    deadlineTimer = setInterval(update, 1000);
  }

  /* ==========================================================================
     CLIENT-SIDE HASH ROUTER
     ========================================================================== */
  function getActiveRoute() {
    const hash = window.location.hash || '#/overview';
    const clean = hash.replace(/^#\/?/, '').split('?')[0];
    return clean || 'overview';
  }

  function updateNavActive(route) {
    navLinks.forEach(link => {
      const page = link.getAttribute('data-page');
      if (page === route) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  async function handleRoute() {
    const route = getActiveRoute();
    updateNavActive(route);

    // Show loading spinner
    pageLoader.style.display = 'flex';
    pageContent.style.display = 'none';

    try {
      switch (route) {
        case 'overview':
          if (typeof window.renderOverviewPage === 'function') {
            await window.renderOverviewPage(pageContent);
          } else {
            renderPlaceholder('Overview', 'Loading overview component...');
          }
          break;

        case 'squad':
          if (typeof window.renderSquadPage === 'function') {
            await window.renderSquadPage(pageContent);
          } else {
            renderPlaceholder('Squad', 'Loading pitch component...');
          }
          break;

        case 'transfers':
          if (typeof window.renderTransfersPage === 'function') {
            await window.renderTransfersPage(pageContent);
          } else {
            renderPlaceholder('Transfers', 'Loading transfer engine component...');
          }
          break;

        case 'captaincy':
          if (typeof window.renderCaptaincyPage === 'function') {
            await window.renderCaptaincyPage(pageContent);
          } else {
            renderPlaceholder('Captaincy', 'Loading captaincy rankings...');
          }
          break;

        case 'chips':
          if (typeof window.renderChipsPage === 'function') {
            await window.renderChipsPage(pageContent);
          } else {
            renderPlaceholder('Chips', 'Loading chips strategy...');
          }
          break;

        case 'players':
          if (typeof window.renderPlayersPage === 'function') {
            await window.renderPlayersPage(pageContent);
          } else {
            renderPlaceholder('Player Explorer', 'Loading player database...');
          }
          break;

        case 'validation':
          if (typeof window.renderValidationPage === 'function') {
            await window.renderValidationPage(pageContent);
          } else {
            renderPlaceholder('Model & Validation', 'Loading validation metrics...');
          }
          break;

        default:
          renderPlaceholder('Page Not Found', `Route "${route}" does not exist.`, '404');
          break;
      }
    } catch (err) {
      console.error('Route handler error:', err);
      pageContent.innerHTML = `
        <div class="card" style="text-align:center; padding: 40px;">
          <h3 style="color: var(--fpl-magenta-neon);">Navigation Error</h3>
          <p style="color: var(--text-muted); margin-top: 8px;">${err.message}</p>
        </div>
      `;
    } finally {
      pageLoader.style.display = 'none';
      pageContent.style.display = 'block';
      window.scrollTo(0, 0);
    }
  }

  function renderPlaceholder(title, description, phase = 'Preview') {
    pageContent.innerHTML = `
      <div class="card" style="text-align: center; padding: 60px 20px; max-width: 720px; margin: 40px auto;">
        <span class="badge badge-cyan" style="margin-bottom: 14px; font-size: 0.8rem;">${phase}</span>
        <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 12px; color: var(--text-primary);">${title}</h2>
        <p style="color: var(--text-secondary); line-height: 1.6; max-width: 520px; margin: 0 auto 24px auto;">
          ${description}
        </p>
        <div style="display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
          <a href="#/overview" class="nav-link" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 16px;">
            &larr; Back to Overview
          </a>
          <a href="#/squad" class="nav-link" style="background: var(--fpl-purple-primary); color: #ffffff; border-radius: var(--radius-sm); padding: 8px 16px;">
            View Pitch Squad &rarr;
          </a>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     PLAYER DETAIL MODAL DRAWER
     ========================================================================== */
  async function openPlayerModal(name, team, id) {
    if (!playerModal || !modalContent) return;

    modalContent.innerHTML = `
      <div style="text-align:center; padding: 40px 10px;">
        <div class="fpl-spinner" style="margin: 0 auto 16px auto;"></div>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Retrieving player stats &amp; shrinkage model signals...</p>
      </div>
    `;
    playerModal.classList.add('active');
    playerModal.setAttribute('aria-hidden', 'false');

    try {
      // Query /api/players with search query
      const url = `/api/players?search=${encodeURIComponent(name || '')}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch player stats');
      const data = await res.json();

      let player = null;
      if (data.players && data.players.length > 0) {
        // Match exact or closest by name and team
        player = data.players.find(p => (!team || p.team === team) && (!name || p.web_name.toLowerCase().includes(name.toLowerCase()))) || data.players[0];
      }

      if (!player) {
        modalContent.innerHTML = `
          <h3 style="color: var(--text-primary);">${escapeHtml(name)}</h3>
          <p style="color: var(--text-muted); margin-top: 10px;">No additional database metrics found for this player.</p>
        `;
        return;
      }

      const fdrBadge = window.renderFDRBadge ? window.renderFDRBadge(player.fixture_difficulty) : player.fixture_difficulty;

      modalContent.innerHTML = `
        <div class="player-modal-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; padding-right: 30px;">
            <div>
              <span class="badge badge-neutral" style="margin-bottom: 6px;">${player.position} &bull; ${escapeHtml(player.team)}</span>
              <h2 id="modal-player-name" style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                ${escapeHtml(player.web_name)}
              </h2>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">
                ${escapeHtml(player.full_name || player.web_name)}
              </div>
            </div>
            <div style="text-align:right;">
              <span style="display:block; font-size: 0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Current Price</span>
              <span style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">&pound;${(player.price || 0).toFixed(1)}m</span>
            </div>
          </div>
        </div>

        <!-- Predicted Points Hero Box -->
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size: 0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">GW5 Predicted Points</span>
              <div style="font-size: 2rem; font-weight: 900; color: var(--fpl-green-neon); line-height: 1.1; margin-top: 4px;">
                ${(player.predicted_points || 0).toFixed(2)} pts
              </div>
            </div>
            <div style="text-align:center;">
              <span style="font-size: 0.72rem; text-transform:uppercase; color:var(--text-muted); font-weight:600; display:block; margin-bottom: 4px;">Next Fixture FDR</span>
              ${fdrBadge}
            </div>
          </div>
          <div style="margin-top: 12px; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">
            Shrinkage formulation: <code>n / (n + 0.1)</code> where <code>n = minutes / 90</code>. Blends prior season mean with 2024-25 live observations.
          </div>
        </div>

        <!-- Metric Cards Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
            <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">3-Game Form</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
              ${(player.form_3 || 0).toFixed(2)}
            </div>
          </div>
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
            <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">5-Game Form</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
              ${(player.form_5 || 0).toFixed(2)}
            </div>
          </div>
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
            <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">Minutes Played</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
              ${player.minutes || 0}'
            </div>
          </div>
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
            <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">ICT Index</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">
              ${(player.ict_index || 0).toFixed(1)}
            </div>
          </div>
        </div>

        <!-- Defensive & Clean Sheet Metric -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 24px;">
          <div style="display:flex; justify-content:space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span style="color:var(--text-secondary);">Team Clean Sheet Rate</span>
            <strong style="color:var(--text-primary);">${((player.team_cs_rate || 0) * 100).toFixed(0)}%</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size: 0.8rem;">
            <span style="color:var(--text-secondary);">Defensive Contribution</span>
            <strong style="color:var(--text-primary);">${(player.defensive_contribution || 0).toFixed(2)}</strong>
          </div>
        </div>

        <button id="modal-close-action" style="width:100%; padding: 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-weight: 600; cursor: pointer;">
          Close Player Stats
        </button>
      `;

      const actionBtn = document.getElementById('modal-close-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', closePlayerModal);
      }

    } catch (err) {
      console.error('Modal error:', err);
      modalContent.innerHTML = `
        <h3 style="color: var(--fpl-magenta-neon);">Error Loading Details</h3>
        <p style="color: var(--text-muted); margin-top: 8px;">${err.message}</p>
      `;
    }
  }

  function closePlayerModal() {
    if (!playerModal) return;
    playerModal.classList.remove('active');
    playerModal.setAttribute('aria-hidden', 'true');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Global exports for modal
  window.openPlayerModal = openPlayerModal;
  window.closePlayerModal = closePlayerModal;

  /* ==========================================================================
     INITIALIZATION & EVENT LISTENERS
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initHeaderMeta();

    // Setup router
    window.addEventListener('hashchange', handleRoute);
    handleRoute();

    // Setup modal close listeners
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closePlayerModal);
    }
    if (playerModal) {
      playerModal.addEventListener('click', (e) => {
        if (e.target === playerModal) {
          closePlayerModal();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && playerModal && playerModal.classList.contains('active')) {
        closePlayerModal();
      }
    });
  });

})();

