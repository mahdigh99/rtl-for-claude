/* ============================================================================
 * dom-guard.js — runs in the PAGE's main world, at document_start.
 *
 * The RTL engine wraps text nodes (math/LaTeX islands) and inserts toggle
 * buttons inside a React-owned tree. When React later reconciles a node we
 * moved, removeChild/insertBefore throw a DOMException and the whole app
 * crashes ("Something went wrong … Failed to execute 'removeChild' on
 * 'Node'"). This is the same class of crash Google Translate causes on React
 * apps — and this file is the same well-known cure: soften exactly the two
 * calls that would otherwise throw. Every valid call behaves as before; a
 * removeChild on a node that moved returns the node, an insertBefore whose
 * reference moved appends instead.
 *
 * The content scripts run in the extension's isolated world, but React runs
 * here in the page's world — so this guard must too (manifest: world MAIN).
 * ========================================================================== */
;(function (w) {
  try {
    if (w.__rtlxDomGuard) return;
    if (typeof w.Node !== "function" || !w.Node.prototype) return;
    w.__rtlxDomGuard = true;
    var origRemove = w.Node.prototype.removeChild;
    w.Node.prototype.removeChild = function (child) {
      if (child && child.parentNode !== this) {
        // Honour the caller's intent: the node must leave the screen, or it
        // lingers as ghost text the app can never remove again.
        if (child.parentNode) origRemove.call(child.parentNode, child);
        return child;
      }
      return origRemove.apply(this, arguments);
    };
    var origInsert = w.Node.prototype.insertBefore;
    w.Node.prototype.insertBefore = function (node, ref) {
      if (ref && ref.parentNode !== this) return this.appendChild(node);
      return origInsert.apply(this, arguments);
    };
  } catch (e) {
    /* never break the page over a guard */
  }
})(typeof window !== "undefined" ? window : this);
