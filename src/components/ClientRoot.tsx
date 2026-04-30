'use client';

import { useEffect, useRef, useState } from 'react';
import Header from './Header';
import Gallery from './Gallery';

function useScrollChromeCompact() {
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  const lastIntentY = useRef(0);
  const ignoreScrollUntil = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastIntentY.current = Math.max(0, window.scrollY);

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      window.requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const now = performance.now();

        if (now < ignoreScrollUntil.current) {
          lastIntentY.current = y;
          ticking.current = false;
          return;
        }

        const updateCompact = (nextCompact: boolean) => {
          if (compactRef.current === nextCompact) return;
          compactRef.current = nextCompact;
          setCompact(nextCompact);
          ignoreScrollUntil.current = now + (nextCompact ? 300 : 450);
        };

        if (y < 24) {
          updateCompact(false);
          lastIntentY.current = y;
          ticking.current = false;
          return;
        }

        if (y - lastIntentY.current > 18) {
          updateCompact(true);
          lastIntentY.current = y;
        } else if (lastIntentY.current - y > 10) {
          updateCompact(false);
          lastIntentY.current = y;
        }

        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return compact;
}

export default function ClientRoot() {
  const chromeCompact = useScrollChromeCompact();

  return (
    <>
      <Header compact={chromeCompact} />
      <Gallery chromeCompact={chromeCompact} />
    </>
  );
}
