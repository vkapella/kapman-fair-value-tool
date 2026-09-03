// Health probe (#47), kept out of index.js so both branches are unit-testable
// without standing up an HTTP server.
//
// The failure this exists to catch is the one a static response cannot see:
// the process is up and serving the built SPA while SQLite is unreachable and
// every /api/* route 500s. The app renders "Unable to load saved data" in that
// state, so a check that only proves the process is listening reports healthy
// for an app nobody can use.
//
// Contract matches Tradelog's src/app/api/health/route.ts, so the three apps
// answer the same question the same way.

/**
 * @param db      an open better-sqlite3 handle
 * @param release { version, sha, machineId } — release identity, carried on
 *                both branches so a degraded reply still says which build it is
 * @returns { status, body } — HTTP status and JSON body
 */
export function healthPayload(db, release = {}) {
  try {
    // Cheapest query that proves the file is open, readable, and actually
    // holds the schema. SELECT 1 would pass against a database with no tables
    // at all, which is exactly the unmounted-volume case worth catching.
    db.prepare("SELECT COUNT(*) AS c FROM stocks").get();
    return { status: 200, body: { status: "ok", db: "connected", ...release } };
  } catch (error) {
    return {
      status: 503,
      body: { status: "degraded", db: "disconnected", error: error.message, ...release },
    };
  }
}
