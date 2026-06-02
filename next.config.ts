import type { NextConfig } from "next";

// The Circles host loads miniapps inside an iframe. Default Next.js responses
// would block that with `X-Frame-Options: SAMEORIGIN`, so we explicitly allow
// the Circles host (prod + dev + any future subdomain) and Vercel preview deploys.
const FRAME_ANCESTORS = [
  "'self'",
  "https://*.gnosis.io",
  "https://*.vercel.app",
].join(" ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${FRAME_ANCESTORS};`,
          },
          // XMTP browser SDK uses SharedArrayBuffer (WASM-backed crypto), which
          // requires cross-origin isolation. `credentialless` is the iframe-
          // friendly variant — cross-origin subresources load without
          // credentials but we still get the isolation guarantees we need.
          // Refs:
          //   https://developer.mozilla.org/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy
          //   https://docs.xmtp.org/protocol/xmtp-mls#browser-environment
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
