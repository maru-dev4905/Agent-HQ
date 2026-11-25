import type { NextConfig } from 'next';

/** The API the dashboard proxies to (same origin for the browser: no CORS, Origin guard intact). */
const API_URL = process.env['AGENT_HQ_API_URL'] ?? 'http://127.0.0.1:4000';
const dev = process.env['NODE_ENV'] !== 'production';

/**
 * Content-Security-Policy (security T5). Everything is same-origin. Next.js inlines its
 * bootstrap scripts, so `script-src` still needs 'unsafe-inline' (and 'unsafe-eval' for the
 * dev server's hot reload); a nonce-based policy is TD-009. Agent content is rendered only
 * as React text, never as HTML, so the CSP is a second line of defence.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // SSE must stream through the proxy unbuffered; gzip would buffer it.
  compress: false,
  rewrites() {
    return Promise.resolve([{ source: '/hq-api/:path*', destination: `${API_URL}/:path*` }]);
  },
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]);
  },
};

export default nextConfig;
