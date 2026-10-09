import { useEffect, useState } from 'react';

// Экранная клавиатура на мобильных.
// iOS Safari/PWA не уменьшает layout viewport при открытии клавиатуры —
// position:fixed-элементы остаются «под» клавиатурой, видимую область
// сообщает только window.visualViewport. Android Chrome с
// interactive-widget=resizes-content (см. index.html) уменьшает и layout
// viewport. Хук покрывает оба случая: открыта ли клавиатура, высота и сдвиг
// видимой области.

export interface KeyboardViewport {
  open: boolean;
  height: number;
  offsetTop: number;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden']);

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

// Клавиатура «открыта», если поле в фокусе и видимая высота заметно меньше
// полной (порог отсекает панели браузера/адресную строку).
const KEYBOARD_MIN_PX = 150;

export function useKeyboardViewport(): KeyboardViewport {
  const [state, setState] = useState<KeyboardViewport>(() => ({
    open: false,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    // Полная высота без клавиатуры — обновляется, пока фокуса в поле нет
    let baseline = Math.max(window.innerHeight, vv?.height ?? 0);
    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const height = Math.round(vv ? vv.height : window.innerHeight);
        const offsetTop = Math.round(vv ? vv.offsetTop : 0);
        const focused = isEditable(document.activeElement);
        if (!focused) baseline = Math.max(window.innerHeight, height);
        const open = focused && baseline - height > KEYBOARD_MIN_PX;
        setState((prev) =>
          prev.open === open && prev.height === height && prev.offsetTop === offsetTop
            ? prev
            : { open, height, offsetTop },
        );
      });
    };

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  return state;
}
