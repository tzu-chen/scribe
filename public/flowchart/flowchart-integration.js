/**
 * flowchart-integration.js
 *
 * Adds interactive features to any flowchart HTML file when embedded in an
 * iframe by FlowchartsPage.tsx:
 *
 *   - Node action icons (write note, attach file, view attachments, view notes)
 *   - Parent-frame communication (node-selected, node-deselected, node-action)
 *   - Attachment count badges
 *
 * Injected at runtime — flowchart HTML files are NOT modified.
 * Requires the flowchart to expose highlightChain, clearHighlight, and
 * selectedNode as globals (all current flowcharts do).
 */
(function () {
  /* Only run when inside an iframe. */
  if (window.parent === window) return;

  /* ================================================================== *
   *  CSS for action icons                                               *
   * ================================================================== */
  var css = document.createElement('style');
  css.id = 'flowchart-integration-css';
  css.textContent =
    '.node-actions{display:none;position:absolute;top:-8px;left:-8px;flex-direction:row;gap:3px;z-index:6;}' +
    '.node.selected .node-actions{display:flex;}' +
    '.node-action-btn{width:22px;height:22px;border-radius:50%;border:1px solid #b0ada4;background:#faf8f4;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;' +
    'transition:background 0.15s,border-color 0.15s;position:relative;}' +
    '.node-action-btn:hover{background:#eae6dc;border-color:#8a8a80;}' +
    '.node-action-btn svg{width:12px;height:12px;fill:none;stroke:#4a4a40;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
    '.node-action-btn:hover svg{stroke:#2a2a28;}' +
    '.attach-count{position:absolute;top:-5px;right:-5px;background:#4263eb;color:#fff;' +
    'font-family:"IBM Plex Mono",monospace;font-size:0.48rem;font-weight:700;' +
    'min-width:13px;height:13px;line-height:13px;text-align:center;border-radius:7px;' +
    'padding:0 3px;display:none;}' +
    '.attach-count.has-files{display:block;}';
  document.head.appendChild(css);

  /* ================================================================== *
   *  Helpers                                                            *
   * ================================================================== */

  /** Strip the leading "0A. " style prefix from a node title. */
  function getCleanTitle(nodeEl) {
    var titleEl = nodeEl.querySelector('.node-title');
    return titleEl
      ? titleEl.textContent.replace(/^\d+[A-Z]?\.\s*/, '').trim()
      : nodeEl.id;
  }

  /* ================================================================== *
   *  Inject action icons into every .node                               *
   * ================================================================== */
  function injectNodeActions() {
    document.querySelectorAll('.node').forEach(function (nodeEl) {
      if (nodeEl.querySelector('.node-actions')) return;

      var actions = document.createElement('div');
      actions.className = 'node-actions';

      /* Write note (pencil) */
      var writeBtn = document.createElement('button');
      writeBtn.className = 'node-action-btn';
      writeBtn.setAttribute('data-action', 'write-note');
      writeBtn.setAttribute('title', 'Write note');
      writeBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';

      /* Attach file (paperclip) */
      var attachBtn = document.createElement('button');
      attachBtn.className = 'node-action-btn';
      attachBtn.setAttribute('data-action', 'attach-file');
      attachBtn.setAttribute('title', 'Attach file');
      attachBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

      /* View attachments (folder) */
      var viewBtn = document.createElement('button');
      viewBtn.className = 'node-action-btn';
      viewBtn.setAttribute('data-action', 'view-attachments');
      viewBtn.setAttribute('title', 'View attachments');
      viewBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

      var badge = document.createElement('span');
      badge.className = 'attach-count';
      badge.setAttribute('data-node-id', nodeEl.id);
      badge.textContent = '0';
      viewBtn.appendChild(badge);

      /* View notes (file-text) */
      var notesBtn = document.createElement('button');
      notesBtn.className = 'node-action-btn';
      notesBtn.setAttribute('data-action', 'view-notes');
      notesBtn.setAttribute('title', 'View notes');
      notesBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/>' +
        '<line x1="16" y1="13" x2="8" y2="13"/>' +
        '<line x1="16" y1="17" x2="8" y2="17"/>' +
        '<polyline points="10 9 9 9 8 9"/></svg>';

      actions.appendChild(writeBtn);
      actions.appendChild(attachBtn);
      actions.appendChild(viewBtn);
      actions.appendChild(notesBtn);
      nodeEl.appendChild(actions);
    });
  }

  injectNodeActions();

  /* ================================================================== *
   *  Intercept action-button clicks (capture phase)                     *
   * ================================================================== */
  document.addEventListener(
    'click',
    function (e) {
      var actionBtn = e.target.closest('.node-action-btn');
      if (!actionBtn) return;

      e.stopPropagation();
      e.preventDefault();

      var nodeEl = actionBtn.closest('.node');
      if (!nodeEl) return;

      window.parent.postMessage(
        {
          type: 'node-action',
          action: actionBtn.getAttribute('data-action'),
          nodeId: nodeEl.id,
          nodeTitle: getCleanTitle(nodeEl),
        },
        '*',
      );
    },
    true,
  ); /* capture phase — runs before the flowchart's own handler */

  /* ================================================================== *
   *  Wrap highlightChain / clearHighlight for parent messaging          *
   * ================================================================== */
  var origHighlight = window.highlightChain;
  var origClear = window.clearHighlight;

  window.highlightChain = function (nodeId) {
    origHighlight(nodeId);
    /* After the original runs, check whether a node ended up selected. */
    if (window.selectedNode === nodeId) {
      var nodeEl = document.getElementById(nodeId);
      if (nodeEl) {
        window.parent.postMessage(
          {
            type: 'node-selected',
            nodeId: nodeId,
            nodeTitle: getCleanTitle(nodeEl),
          },
          '*',
        );
      }
    }
    /* If selectedNode is null, the original called clearHighlight()
       internally (toggle-off), and our clearHighlight wrapper already
       sent node-deselected. */
  };

  window.clearHighlight = function () {
    origClear();
    window.parent.postMessage({ type: 'node-deselected' }, '*');
  };

  /* ================================================================== *
   *  Receive attachment counts from parent                              *
   * ================================================================== */
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'attachment-counts') return;

    var counts = e.data.counts || {};
    document.querySelectorAll('.attach-count').forEach(function (badge) {
      var nodeId = badge.getAttribute('data-node-id');
      var nodeEl = document.getElementById(nodeId);
      if (!nodeEl) return;
      var count = counts[getCleanTitle(nodeEl)] || 0;
      badge.textContent = String(count);
      badge.classList.toggle('has-files', count > 0);
    });
  });
})();
