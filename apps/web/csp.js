const PRODUCTION_API_FALLBACK = 'https://api.nestwork.site';

function validatedOrigin(value, protocols) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function websocketOrigin(apiOrigin) {
  const url = new URL(apiOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

function validateProductionRuntimeConfig(options = {}) {
  const apiOrigin = validatedOrigin(options.apiUrl, ['https:']);
  if (!apiOrigin) {
    throw new Error('NEXT_PUBLIC_API_URL must be an HTTPS origin for a production build');
  }

  const wsOrigin = options.wsUrl
    ? validatedOrigin(options.wsUrl, ['wss:'])
    : websocketOrigin(apiOrigin);
  if (!wsOrigin) {
    throw new Error('NEXT_PUBLIC_WS_URL must be a WSS origin when it is set');
  }

  return { apiOrigin, wsOrigin };
}

function buildContentSecurityPolicy(options = {}) {
  const isDevelopment = options.isDevelopment ?? false;
  const fallbackApi = isDevelopment ? 'http://localhost:4000' : PRODUCTION_API_FALLBACK;
  const apiOrigin = validatedOrigin(options.apiUrl, isDevelopment ? ['http:', 'https:'] : ['https:']) ?? fallbackApi;
  const wsOrigin = validatedOrigin(options.wsUrl, isDevelopment ? ['ws:', 'wss:'] : ['wss:']) ?? websocketOrigin(apiOrigin);
  const developmentConnections = isDevelopment ? ['http://localhost:*', 'ws://localhost:*'] : [];

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${apiOrigin}`,
    "media-src 'self' blob:",
    `connect-src ${["'self'", apiOrigin, wsOrigin, ...developmentConnections].join(' ')}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!isDevelopment ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

module.exports = {
  buildContentSecurityPolicy,
  validateProductionRuntimeConfig,
  validatedOrigin,
  PRODUCTION_API_FALLBACK,
};
