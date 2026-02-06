// API Configuration
// In production (Vercel), use proxy to avoid mixed content (HTTPS→HTTP) issues
// In development, call VPS directly

const isDev = import.meta.env.DEV;

// In production, we proxy through Vercel serverless to hit the VPS
// This avoids browser blocking HTTP requests from HTTPS pages
export const API_BASE = isDev 
  ? 'http://localhost:3001'
  : '';  // Empty = same origin, uses /api/* which Vercel proxies

export const apiUrl = (path) => `${API_BASE}${path}`;
