/**
 * FPL Official Fixture Difficulty Rating (FDR) Component
 * Official Colors:
 * FDR 1: Dark Green (#00754a)
 * FDR 2: Mint Green (#00ff87)
 * FDR 3: Grey (#6b7280)
 * FDR 4: Red/Coral (#ff1751)
 * FDR 5: Deep Maroon (#80072d)
 */

(function () {
  'use strict';

  /**
   * Return human-readable difficulty label
   * @param {number} diff 1-5
   * @returns {string}
   */
  function getFDRDescription(diff) {
    const d = parseInt(diff, 10) || 3;
    switch (d) {
      case 1:
        return 'Very Easy';
      case 2:
        return 'Easy';
      case 3:
        return 'Moderate';
      case 4:
        return 'Tough';
      case 5:
        return 'Very Tough';
      default:
        return 'Moderate';
    }
  }

  /**
   * Render an FDR badge element string
   * @param {number} diff 1-5
   * @param {string} [extraClass='']
   * @returns {string} HTML string
   */
  function renderFDRBadge(diff, extraClass = '') {
    const d = Math.max(1, Math.min(5, parseInt(diff, 10) || 3));
    const label = getFDRDescription(d);
    return `<span class="fdr-badge fdr-${d} ${extraClass}" title="Fixture Difficulty: ${d}/5 (${label})">${d}</span>`;
  }

  // Export to global window scope
  window.renderFDRBadge = renderFDRBadge;
  window.getFDRDescription = getFDRDescription;
})();

