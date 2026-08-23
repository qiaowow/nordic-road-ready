"use client";

import { useEffect } from "react";

export function PwaBootstrap() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // A development worker can cache Vite's HMR client and make previews use
      // incompatible runtime modules after a restart.
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
      return;
    }

    navigator.serviceWorker.register("sw.js").catch(() => {
      // The app remains usable online when service workers are unavailable.
    });
  }, []);
  return null;
}
