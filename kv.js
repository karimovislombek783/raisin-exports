// Vercel KV auto-configures itself from the KV_REST_API_URL / KV_REST_API_TOKEN
// environment variables that Vercel injects once you link a KV store to this
// project — no manual setup needed here.

const { kv } = require('@vercel/kv');

module.exports = { kv };
