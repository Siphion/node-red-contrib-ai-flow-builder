"use strict";

const DEFAULT_SENSITIVE_KEYS = [
  "password", "passwd", "pwd",
  "token", "accesstoken", "refreshtoken", "idtoken",
  "secret", "clientsecret",
  "apikey", "api_key", "x-api-key",
  "auth", "authorization", "bearer",
  "privatekey", "private_key",
  "credentials"
];

const REDACTED = "[REDACTED]";

function normalizeKey(k) {
  return String(k).toLowerCase().replace(/[-_\s]/g, "");
}

function isSensitiveKey(key, sensitive) {
  const n = normalizeKey(key);
  return sensitive.some(s => n === s || n.includes(s));
}

/**
 * Deep-sanitizes a flow JSON for safe transmission to an LLM.
 *
 * - Removes config nodes of types listed in `stripTypes` (default: ai-provider-config).
 * - Replaces values under keys matching `sensitiveKeys` (password, token, secret, apiKey, auth, credentials, …) with "[REDACTED]".
 *   The key NAME is kept so the model still understands the structure.
 *
 * Note: `${env.FOO}` / `${settings.BAR}` references are left intact — they are only names,
 * not the actual secrets (which live in settings.js / process.env, never in flow JSON).
 *
 * Returns a NEW object; the input is untouched.
 */
function sanitizeFlows(flows, opts = {}) {
  const sensitive = (opts.sensitiveKeys || DEFAULT_SENSITIVE_KEYS).map(normalizeKey);
  const stripTypes = new Set(opts.stripTypes || ["ai-provider-config"]);

  const arr = Array.isArray(flows) ? flows : [flows];
  const out = arr
    .filter(n => !(n && typeof n === "object" && stripTypes.has(n.type)))
    .map(n => sanitizeValue(n, sensitive));
  return Array.isArray(flows) ? out : out[0];
}

function sanitizeValue(value, sensitive) {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(v => sanitizeValue(v, sensitive));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k, sensitive)) {
      out[k] = REDACTED;
    } else {
      out[k] = sanitizeValue(v, sensitive);
    }
  }
  return out;
}

module.exports = {
  sanitizeFlows,
  DEFAULT_SENSITIVE_KEYS,
  REDACTED
};
