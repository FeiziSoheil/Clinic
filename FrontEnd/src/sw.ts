/// <reference lib="webworker" />

/**
 * Service worker source for the Clinick PWA.
 *
 * This file is compiled by `@serwist/next` into `public/sw.js` and registered
 * automatically in production builds. In development the SW is disabled (see
 * `next.config.ts`) to avoid stale-caching noise.
 *
 * Precaching is fed by the build manifest (`self.__SW_MANIFEST`) injected at
 * compile time, and runtime caching reuses Serwist's battle-tested
 * `defaultCache` strategies (sensible network-first / cache-first rules for
 * static assets, fonts, images, etc.).
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Build-time precache manifest injected by @serwist/next.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Take control of all clients as soon as the SW activates so updates apply
  // promptly and the app works offline immediately after first load.
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
