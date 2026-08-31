// ── Modal machinery ──────────────────────────────────────────
// Open, close, focus trap, restore focus. Kept from the template because the
// share, compare, builds and keys dialogs all want it. Lives in its own file
// so both events.js and actions.js can open a dialog without importing each
// other.

let lastFocus = null;

export function getFocusable(root) {
  if (!root) return [];
  const sel =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll(sel)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

export function openModalEl() {
  return document.querySelector('.modal:not([hidden])');
}

export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocus = document.activeElement;
  modal.removeAttribute('hidden');
  document.body.classList.add('modal-open');
  const list = getFocusable(modal.querySelector('.modal__dialog'));
  const closeBtn = modal.querySelector('.modal__header [data-modal-close]');
  const first = closeBtn && list.includes(closeBtn) ? closeBtn : list[0];
  if (first) first.focus();
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.classList.remove('modal-open');
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

/** Escape closes; Tab cycles inside the open dialog. */
export function onModalKeydown(e) {
  const modal = openModalEl();
  if (!modal || !modal.id) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal(modal.id);
    return;
  }
  if (e.key !== 'Tab') return;
  const list = getFocusable(modal.querySelector('.modal__dialog'));
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
