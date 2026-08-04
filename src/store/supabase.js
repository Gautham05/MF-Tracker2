import { createClient } from '@supabase/supabase-js';

const CRED_KEY = 'mft_supa_creds';

export function getSupaCreds() {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c?.url && c?.key ? c : null;
  } catch { return null; }
}

export function saveSupaCreds(url, key) {
  localStorage.setItem(CRED_KEY, JSON.stringify({ url: url.trim(), key: key.trim() }));
  _client = null; // reset singleton so next getSupaClient() uses new creds
}

export function clearSupaCreds() {
  localStorage.removeItem(CRED_KEY);
  _client = null;
}

export function isLoggedIn() {
  return !!getSupaCreds();
}

// Singleton — one client instance for the whole app lifetime
let _client = null;

export function getSupaClient() {
  if (_client) return _client;
  const creds = getSupaCreds();
  if (!creds) return null;
  _client = createClient(creds.url, creds.key);
  return _client;
}
