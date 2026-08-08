import test, { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { Readable } from "node:stream";

const DB_FILE = join(tmpdir(), `kairos-wave8-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;
const repo = await import("../server/repo.js");
const routes = await import("../server/routes.js");
const auth = await import("../server/auth.js");
const { setDefaultUserId } = await import("../server/authctx.js");
const a = auth.findOrCreateUser("wave8-a@example.com");
const b = auth.findOrCreateUser("wave8-b@example.com");
repo.ensureUser(a.id); repo.ensureUser(b.id); setDefaultUserId(a.id);
const ca = `${auth.COOKIE_NAME}=${auth.createSession(a.id).id}`;
const cb = `${auth.COOKIE_NAME}=${auth.createSession(b.id).id}`;
function req(method, url, body, cookie = ca) {
  const r = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  r.method = method; r.url = url; r.headers = { cookie, host: "localhost" }; r.socket = { remoteAddress: "127.0.0.1" }; return r;
}
const call = (method, url, body, cookie) => routes.handleApi(req(method, url, body, cookie), url);
after(() => { for (const x of ["", "-wal", "-shm", "-journal"]) try { rmSync(DB_FILE + x, { force: true }); } catch {} });

test("verschachtelte eigene Sidebar und Funktions-Ziel landen im Snapshot", async () => {
  let s = (await call("POST", "/api/nav-nodes", { name: "Russian", kind: "folder" })).body;
  const root = s.navNodes.find((n) => n.name === "Russian");
  s = (await call("POST", "/api/nav-nodes", { parentId: root.id, name: "Prüfungen", kind: "view", view: "exam" })).body;
  const child = s.navNodes.find((n) => n.name === "Prüfungen");
  assert.equal(child.parentId, root.id);
  assert.equal(child.kind, "view");
  assert.equal(child.view, "exam");
});

test("Ordner-Zyklen werden abgelehnt", async () => {
  let s = (await call("POST", "/api/nav-nodes", { name: "A" })).body;
  const aNode = s.navNodes.find((n) => n.name === "A");
  s = (await call("POST", "/api/nav-nodes", { parentId: aNode.id, name: "B" })).body;
  const bNode = s.navNodes.find((n) => n.name === "B");
  await assert.rejects(() => call("PUT", `/api/nav-nodes/${aNode.id}`, { parentId: bNode.id }), (e) => e.status === 400);
});

test("eigene Sidebar bleibt mandantengetrennt und Löschen kaskadiert", async () => {
  let s = (await call("POST", "/api/nav-nodes", { name: "Private" })).body;
  const root = s.navNodes.find((n) => n.name === "Private");
  await call("POST", "/api/nav-nodes", { parentId: root.id, name: "Child" });
  assert.equal((await call("GET", "/api/state", null, cb)).body.navNodes.length, 0);
  s = (await call("DELETE", `/api/nav-nodes/${root.id}`)).body;
  assert.ok(!s.navNodes.some((n) => n.name === "Private" || n.name === "Child"));
});
