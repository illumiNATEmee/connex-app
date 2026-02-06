// API Configuration
// In production (Vercel), we'll call the VPS backend
// In development, we can use localhost

const isDev = import.meta.env.DEV;

export const API_BASE = isDev 
  ? 'http://localhost:3001'
  : 'http://5.78.176.132:3001';

export const apiUrl = (path) => `${API_BASE}${path}`;
