// Reports whether a scroll container has content hidden past its top and/or
// bottom edge, so the edges can show a shadow only when there's more to see.
//
// Re-measures on scroll and whenever the container or any of its children
// resize — sections collapsing and expanding change the content height
// without a scroll event.

import { useEffect, useRef, useState } from 'react';

export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // 1px tolerance: fractional scroll positions on zoomed or HiDPI screens.
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));
    el.addEventListener('scroll', measure, { passive: true });
    measure();

    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, []);

  return { ref, edges };
}
