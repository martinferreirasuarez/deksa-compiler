"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
const positionKey = "deksa-trainer-comparison";
export function TrainerPackageNavigation({ children }: { children: ReactNode }) {
  const nav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const measure = () => document.documentElement.style.setProperty("--wiki-topbar-height", `${topbar?.getBoundingClientRect().height ?? 54}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (topbar) observer.observe(topbar);
    try {
      const saved = sessionStorage.getItem(positionKey);
      sessionStorage.removeItem(positionKey);
      if (saved) {
        const position = JSON.parse(saved);
        if (position.url === location.pathname + location.search) {
          const card = document.getElementById(position.id);
          if (card) window.scrollBy(0, card.getBoundingClientRect().top - position.top);
        }
      }
    } catch { /* Native navigation works without storage. */ }
    return () => observer.disconnect();
  }, []);
  return <nav ref={nav} className="trainer-package-tabs lot-trainer-packages" aria-label="Trainer teams" onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const link = (event.target as Element).closest("a");
    if (!link) return;
    const boundary = nav.current?.getBoundingClientRect().bottom ?? 0;
    const card = [...document.querySelectorAll<HTMLElement>(".generated-trainer-card")].find((element) => element.getBoundingClientRect().bottom > boundary);
    if (!card) return;
    try {
      const url = new URL(link.href);
      sessionStorage.setItem(positionKey, JSON.stringify({ url: url.pathname + url.search, id: card.id, top: card.getBoundingClientRect().top }));
    } catch { /* Native navigation works without storage. */ }
  }}>{children}</nav>;
}
