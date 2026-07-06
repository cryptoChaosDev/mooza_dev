/**
 * iOS-compatible scroll lock.
 *
 * `overflow: hidden` on body is ignored by iOS Safari.
 * The correct fix: set `position: fixed` + save/restore scrollY.
 */
import { useEffect } from 'react';

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
  // iOS: убрать rubber-band страницы, пока открыта модалка — иначе протяжка вниз
  // по короткому bottom-sheet «утаскивает» фиксированный оверлей и он застревает.
  document.documentElement.style.overscrollBehavior = 'none';
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
  document.documentElement.style.overscrollBehavior = '';
  window.scrollTo({ top: _scrollY, behavior: 'instant' as ScrollBehavior });
}

/**
 * Lock body scroll while `active` is true (e.g. a modal/sheet is open) and release
 * it on close/unmount. Ref-counted, so nested modals are safe. Use this in every
 * modal so the iOS background doesn't scroll/«jump» behind it.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return () => unlockScroll();
  }, [active]);
}
