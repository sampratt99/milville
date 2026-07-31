// ============================================================================
//  Milville multiplayer relay  —  Cloudflare Worker + Durable Object
//  Free Workers plan compatible (SQLite-backed DO class, WebSocket hibernation).
//  One Durable Object == one shared "room" (world). It relays presence,
//  position, gear/action state, chat, emotes, and enemy claims between clients.
//  Mostly a relay (client-authoritative), but it now also remembers SHARED-WORLD
//  STATE in ctx.storage (hibernation-safe): which mobs are dead and which resource
//  nodes are depleted, with their respawn times, so a player who joins mid-session
//  sees the same world. It still does NOT simulate AI/combat. Authoritative
//  trade/PVP escrow can be added inside this same object later.
// ============================================================================
import { DurableObject } from "cloudflare:workers";
import { recordMobDead, recordNode, buildSnapshot } from "./world_state.js";
import { handleLeaderboard } from "./leaderboard.js";
import { listOffer, cancelOffer, collect, ackCollect, board, mine } from "./market.js";

// CORS for the market's plain-HTTP endpoints (same shape as the leaderboard).
const MKT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const MKT_BUILD = "mkt5";   // bump with market changes; check via the x-mkt-build response header
const _mj = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { "Content-Type": "application/json", "x-mkt-build": MKT_BUILD, ...MKT_CORS }
});
const DEFAULT_WORLD = "milville";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/lb/")) return handleLeaderboard(request, env);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Milville relay v5 (shared-world state + relay + market build " + MKT_BUILD + ") is running.", { status: 200 });
    }
    // Player market: plain HTTP so OFFLINE players' offers can be matched.
    // Routed to the per-world Room DO so the order book lives beside that
    // world's shared state (?world=milville, defaulting like everything else).
    if (url.pathname.startsWith("/mkt/")) {
      if (request.method === "OPTIONS") return new Response(null, { headers: MKT_CORS });
      const world = (url.searchParams.get("world") || DEFAULT_WORLD).slice(0, 32);
      const id = env.ROOM.idFromName(world + "-mkt");
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname.startsWith("/room/")) {
      const room = decodeURIComponent(url.pathname.slice("/room/".length)) || DEFAULT_WORLD;
      const id = env.ROOM.idFromName(room);
      return env.ROOM.get(id).fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    // ---- keepalive pings must not WAKE this object -------------------------
    // Every client pings every 10s purely to keep its socket warm. Handling that
    // in webSocketMessage() wakes the Durable Object, and duration is billed as
    // wall-clock time while it is awake -- so idle players were being charged for
    // doing nothing. setWebSocketAutoResponse() lets the runtime answer the ping
    // itself: the docs are explicit that auto-responses incur no wall-clock time.
    // The string must match byte-for-byte what the client sends ({"t":"ping"}).
    // The case "ping" handler below stays as a harmless fallback.
    try {
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair(
          JSON.stringify({ t: "ping" }),
          JSON.stringify({ t: "pong" })
        )
      );
    } catch (e) {}
  }
  async fetch(request) {
    const url = new URL(request.url);
    // ---- Player market (plain HTTP; storage lives in this DO) ----------------
    if (url.pathname.startsWith("/mkt/")) return this._market(request, url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    // acceptWebSocket() enrolls the socket in the Hibernation API so the object
    // can be evicted from memory while idle -> no duration charges between messages.
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  // ---- player market handler (HTTP; ctx.storage-backed order book) ----------
  // Serialised through a single in-flight promise chain so concurrent listing/
  // matching on the same DO can never interleave and double-spend escrow.
  async _market(request, url) {
    const store = this.ctx.storage, now = Date.now;
    const path = url.pathname;
    // reads don't need the mutation lock
    try {
      if (request.method === "GET" && path === "/mkt/board") {
        const item = url.searchParams.get("item") || undefined;
        const res = await board(store, now, { item }); res.v = MKT_BUILD;
        return _mj(res);
      }
      if (request.method === "GET" && path === "/mkt/mine") {
        const uid = url.searchParams.get("uid") || "";
        if (!uid) return _mj({ ok: false, error: "no uid" }, 400);
        const res = await mine(store, { uid }); res.v = MKT_BUILD;
        return _mj(res);
      }
      if (request.method !== "POST") return _mj({ ok: false, error: "not found" }, 404);
      let b; try { b = await request.json(); } catch (e) { return _mj({ ok: false, error: "bad json" }, 400); }

      // serialise mutations
      const run = async () => {
        if (path === "/mkt/list")   return await listOffer(store, now, b);
        if (path === "/mkt/cancel") return await cancelOffer(store, now, b);
        if (path === "/mkt/collect")return await collect(store, { uid: String(b.uid || ""), twophase: !!b.twophase });
        if (path === "/mkt/ack")    return await ackCollect(store, { uid: String(b.uid || ""), nonce: String(b.nonce || "") });
        return { ok: false, error: "not found", _404: true };
      };
      this._mktChain = Promise.resolve(this._mktChain).catch(() => {}).then(run);
      const res = await this._mktChain;
      if (res && res._404) return _mj({ ok: false, error: "not found" }, 404);

      // ** WRITE-CONFIRM GUARD (dupe/loss-safe). **
      // The client escrows the item BEFORE we reply and only keeps it removed when we return
      // ok:true. Storage writes in a DO are coalesced and can, in rare failure modes, not land even
      // though the in-memory logic returned ok:true -- which would silently eat the player's item.
      // So before we confirm a LIST, force pending writes to disk (sync) and READ THE OFFER BACK.
      // If it isn't actually there, we downgrade to ok:false so the client refunds the item rather
      // than losing it. This converts "silent item loss" into "offer didn't place, item returned".
      if (path === "/mkt/list" && res && res.ok) {
        let persisted = true;
        try {
          if (store.sync) await store.sync();            // flush the write buffer to disk
          if (res.remaining > 0) {                       // an offer rests only if qty remains
            const back = await store.get("mkt:offer:" + res.id);
            persisted = !!back;
          }
          // a fully-matched offer (remaining 0) rests nothing; its payouts are in collect boxes,
          // which the same write buffer flushed above -- nothing extra to verify.
        } catch (e) { persisted = false; }
        if (!persisted) {
          // best-effort cleanup of a half-written offer, then tell the client it failed.
          try { await store.delete("mkt:offer:" + res.id); } catch (e) {}
          return _mj({ ok: false, error: "storage did not persist the offer; item returned" });
        }
      }
      return _mj(res);
    } catch (e) {
      // surface the reason in the response so the client message is useful and the item is refunded.
      return _mj({ ok: false, error: "server error: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  }
  // ---- attachment helpers (survive hibernation) ----
  _get(ws) { try { return ws.deserializeAttachment() || null; } catch (e) { return null; } }
  _set(ws, a) { try { ws.serializeAttachment(a); } catch (e) {} }
  _send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  _broadcast(obj, exceptUid) {
    const s = JSON.stringify(obj);
    for (const w of this.ctx.getWebSockets()) {
      if (exceptUid) { const a = this._get(w); if (a && a.uid === exceptUid) continue; }
      try { w.send(s); } catch (e) {}
    }
  }
  _roster(exceptUid) {
    const out = [];
    for (const w of this.ctx.getWebSockets()) {
      const a = this._get(w);
      if (!a || !a.joined) continue;
      if (exceptUid && a.uid === exceptUid) continue;
      out.push(a.p);
    }
    return out;
  }
  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    let a = this._get(ws) || {};
    switch (m.t) {
      case "join": {
        if (typeof m.uid !== "string" || typeof m.name !== "string") return;
        const p = {
          uid: m.uid.slice(0, 40),
          name: m.name.slice(0, 24),
          x: +m.x || 0, y: +m.y || 0, h: +m.h || 0, run: false,
          app: (m.app && typeof m.app === "object") ? m.app : null,
          gear: (m.gear && typeof m.gear === "object") ? m.gear : null,
          act: null,
          hp: +m.hp || 0, mhp: +m.mhp || 0
        };
        a = { uid: p.uid, name: p.name, joined: true, p };
        this._set(ws, a);
        // 1) tell the newcomer who is already here
        this._send(ws, { t: "welcome", you: p.uid, roster: this._roster(p.uid) });
        // 2) tell everyone else about the newcomer
        this._broadcast({ t: "join", p }, p.uid);
        // 3) hand the newcomer the shared-world snapshot (dead mobs / depleted nodes),
        //    but only if their client advertises support (m.snap) so older clients,
        //    which would not understand a "snapshot" message, are completely unaffected.
        if (m.snap) {
          try { this._send(ws, await buildSnapshot(this.ctx.storage, Date.now)); } catch (e) {}
        }
        break;
      }
      case "pos": {
        if (!a.joined) return;
        a.p.x = +m.x; a.p.y = +m.y; a.p.h = +m.h || 0; a.p.run = !!m.run;
        this._set(ws, a);
        this._broadcast({ t: "pos", uid: a.uid, name: a.name, x: a.p.x, y: a.p.y, h: a.p.h, run: a.p.run }, a.uid);
        break;
      }
      case "state": {
        if (!a.joined) return;
        if (m.gear !== undefined) a.p.gear = m.gear;
        if (m.act !== undefined) a.p.act = m.act;
        if (m.hp !== undefined) a.p.hp = +m.hp || 0;
        if (m.mhp !== undefined) a.p.mhp = +m.mhp || 0;
        this._set(ws, a);
        this._broadcast({ t: "state", uid: a.uid, gear: a.p.gear, act: a.p.act, hp: a.p.hp, mhp: a.p.mhp }, a.uid);
        break;
      }
      case "chat": {
        if (!a.joined || typeof m.text !== "string") return;
        const text = m.text.slice(0, 120);
        if (!text) return;
        this._broadcast({ t: "chat", uid: a.uid, name: a.name, text }, a.uid);
        break;
      }
      case "emote": {
        if (!a.joined || typeof m.e !== "string") return;
        this._broadcast({ t: "emote", uid: a.uid, e: m.e.slice(0, 24) }, a.uid);
        break;
      }
      case "claim": {
        if (!a.joined) return;
        this._broadcast({ t: "claim", uid: a.uid, m: (m.m | 0) }, a.uid);
        break;
      }
      case "release": {
        if (!a.joined) return;
        this._broadcast({ t: "release", uid: a.uid, m: (m.m | 0) }, a.uid);
        break;
      }
      case "ping": {
        this._send(ws, { t: "pong" });
        break;
      }
      case "mobdead": {
        // a client killed a mob it owns -> persist the respawn so joiners can align,
        // and relay so live peers set their copy dead on the same wall-clock window.
        if (!a.joined) return;
        const mi = m.m | 0, rs = m.rs | 0;
        try { await recordMobDead(this.ctx.storage, Date.now, mi, rs); } catch (e) {}
        this._broadcast({ t: "mobdead", uid: a.uid, m: mi, rs }, a.uid);
        break;
      }
      case "node": {
        // resource node depleted -> persist respawn (back-fills late joiners) + relay.
        if (!a.joined) return;
        try { await recordNode(this.ctx.storage, Date.now, m.x | 0, m.y | 0, m.rs | 0); } catch (e) {}
        this._broadcast({ t: "node", uid: a.uid, x: m.x | 0, y: m.y | 0, df: m.df, rs: m.rs | 0 }, a.uid);
        break;
      }
      // Generic relay for any other typed message from a joined client
      // (mob state, and future trade / PVP / boss messages). Trusted-friends relay.
      default: {
        if (a.joined && typeof m.t === "string") {
          m.uid = a.uid;
          this._broadcast(m, a.uid);
        }
      }
    }
  }
  async webSocketClose(ws) {
    const a = this._get(ws);
    if (a && a.uid) this._broadcast({ t: "leave", uid: a.uid }, a.uid);
    try { ws.close(); } catch (e) {}
  }
  async webSocketError(ws) {
    const a = this._get(ws);
    if (a && a.uid) this._broadcast({ t: "leave", uid: a.uid }, a.uid);
  }
}
