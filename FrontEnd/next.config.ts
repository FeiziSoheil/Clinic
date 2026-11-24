 import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

/**
 * Serwist (modern PWA successor for Next.js 15/16 + React 19) wraps the
 * Next config. It compiles `src/sw.ts` into `public/sw.js` and registers the
 * service worker automatically in production builds.
 *
 * The SW is disabled in development to avoid caching noise / stale data while
 * iterating.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  /*
   * Next.js 16 enables Turbopack by default. The @serwist/next plugin injects
   * a `webpack` config (to compile the service worker), which Next treats as a
   * potential mistake unless a `turbopack` config is also present. Setting an
   * empty `turbopack` block signals the intent to run on Turbopack for dev and
   * silences that error. Serwist's webpack config only affects the production
   * SW build, which is disabled in dev anyway.
   */
  turbopack: {},
};

export default withSerwist(nextConfig);
