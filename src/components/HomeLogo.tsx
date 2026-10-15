"use client";

import { useEffect, useState } from "react";

/** Shows the platform initial until the icon has actually loaded, so a failed icon never renders as a broken image. */
export default function HomeLogo({ src, initial }: { src: string; initial: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = src;
  }, [src]);
  return (
    <div
      className="flex h-20 w-20 items-center justify-center rounded-2xl"
      style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
    >
      {loaded
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" className="h-14 w-14" />
        : <span className="text-3xl font-bold text-primary">{initial}</span>}
    </div>
  );
}
