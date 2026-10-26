"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Tells the user why actions fail while offline. Writes are not queued:
 * there is no offline sync, so nothing pretends to be saved.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;
  return (
    <div
      role="status"
      className="border-b border-border bg-muted px-4 py-2 text-center text-sm text-muted-foreground"
    >
      You are offline. Changes can&apos;t be saved until the connection returns.
    </div>
  );
}
