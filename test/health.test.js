import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { healthPayload } from "../server/lib/health.js";

// #47: /health and /healthz used to fall through to the SPA and return 200
// with HTML for any request — a health check that could not fail. The point of
// these tests is the FAILING direction: a gate that only proves it can pass is
// the defect, not the fix.

const withStocks = () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE stocks (ticker TEXT PRIMARY KEY)");
  db.prepare("INSERT INTO stocks (ticker) VALUES (?)").run("NVDA");
  return db;
};

test("a reachable database reports ok/connected with a 200", () => {
  const { status, body } = healthPayload(withStocks());
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.db, "connected");
});

test("a database missing the schema reports degraded with a 503", () => {
  // The unmounted-volume case: the file opens fine and holds no tables, which
  // is why the probe counts a real table instead of running SELECT 1.
  const { status, body } = healthPayload(new Database(":memory:"));
  assert.equal(status, 503);
  assert.equal(body.status, "degraded");
  assert.equal(body.db, "disconnected");
  assert.match(body.error, /no such table/i);
});

test("a closed database reports degraded rather than throwing", () => {
  // The handler must never propagate: an exception out of the route would be
  // a 500 from the error handler, which reads as a different fault than
  // "this instance knows it is unhealthy".
  const db = withStocks();
  db.close();
  const { status, body } = healthPayload(db);
  assert.equal(status, 503);
  assert.equal(body.db, "disconnected");
});

test("release identity is carried on BOTH branches", () => {
  // A degraded reply still has to say which build is degraded, or a rollback
  // cannot be aimed.
  const release = { version: "abc1234", sha: "abc1234def", machineId: "m-1" };
  const ok = healthPayload(withStocks(), release);
  const bad = healthPayload(new Database(":memory:"), release);
  for (const { body } of [ok, bad]) {
    assert.equal(body.version, "abc1234");
    assert.equal(body.sha, "abc1234def");
    assert.equal(body.machineId, "m-1");
  }
});

test("the ok branch cannot be reached without querying the table", () => {
  // Guards the probe itself: if someone weakens it to SELECT 1, this fails.
  const db = new Database(":memory:");
  db.exec("CREATE TABLE unrelated (x INTEGER)");
  assert.equal(healthPayload(db).status, 503);
});
