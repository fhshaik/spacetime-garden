// Default for vite dev. The vite proxy handles /api/* → backend ports,
// so an empty API_BASE (relative paths) is correct in dev.
//
// In production, the nginx container's entrypoint overwrites this file
// from config.js.template at startup, substituting the real API_BASE
// from the API_BASE env var. Same image, different envs.
window.__ENV__ = { API_BASE: "" };
