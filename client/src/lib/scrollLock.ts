/**
 * iOS-compatible scroll lock.
 *
 * `overflow: hidden` on body is ignored by iOS Safari.
 * The correct fix: set `position: fixed` + save/restore scrollY.
 */
let _scrollY = 0;
let _lockCount = 0;

export function lockScroll() {
  _lockCount++;
  if (_lockCount > 1) return; // already locked

  _scrollY = window.scrollY;
  const body = document.body;
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${_scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
}

export function unlockScroll() {
  _lockCount = Math.max(0, _lockCount - 1);
  if (_lockCount > 0) return; // another modal still open

  const body = document.body;
  body.style.overflow = '';
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  window.scrollTo({ top: _scrollY, behavior: 'instant' as ScrollBehavior });
}
