/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== 'production';
const { buildContentSecurityPolicy, validateProductionRuntimeConfig } = require('./csp');
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const wsUrl = process.env.NEXT_PUBLIC_WS_URL;

if (!isDevelopment) validateProductionRuntimeConfig({ apiUrl, wsUrl });
// Next emits framework bootstrap scripts inline. A static header therefore
// needs unsafe-inline for scripts; removing it requires per-request nonces and
// dynamic rendering. Production deliberately excludes unsafe-eval.
const contentSecurityPolicy = buildContentSecurityPolicy({
  isDevelopment,
  apiUrl,
  wsUrl,
});

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }, // anti-clickjacking
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // WebRTC needs camera/mic/screen for this origin; deny everything else.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig = {
  // Disabled: StrictMode's double-invoke in dev breaks Phaser (double game init)
  // and churns the socket connection. Production never double-invokes, so this
  // makes dev behave like prod.
  reactStrictMode: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
