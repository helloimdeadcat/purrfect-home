"use client";

import { useEffect } from "react";

/** Registers /sw.js in production only (dev HMR and SWs don't mix well). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Installability is a nicety; the app works without the worker.
      });
  }, []);

  return null;
}
