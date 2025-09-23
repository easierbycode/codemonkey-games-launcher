import { HandlerContext, Handlers } from "$fresh/server.ts";
import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { GAMES_DIR, ROOT } from "../lib/utils.ts";

const injections = {
  css: `\n<style>
    html,body{margin:0;padding:0;height:100%;overflow:hidden;}
    canvas{display:block;}
    ::-webkit-scrollbar{display:none}
    html, body { cursor: none !important; }
    html.cmg-cursor-visible, body.cmg-cursor-visible, .cmg-cursor-visible * { cursor: auto !important; }
  </style>\n`,
  osd: `\n<script>(function(){
    function shouldOpen(e){return (e.code==='Backquote'||e.keyCode===192||e.which===192);}
    function onKey(e){ if(shouldOpen(e)){ try{ parent.postMessage({cmg:'osd',action:'open'}, location.origin); }catch(_){} if(e.preventDefault) e.preventDefault(); if(e.stopPropagation) e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
      var k=e.key||e.code; if(k==='Escape'){ try{ parent.postMessage({cmg:'osd',action:'exit'}, location.origin); }catch(_){}} }
    try{ document.addEventListener('keydown', onKey, true); window.addEventListener('keydown', onKey, true);}catch(_){}}
  )();</script>\n`,
  disableContextMenu: `\n<script>(function(){
    try{
      var handler=function(e){ if(e && e.preventDefault) e.preventDefault(); if(e && e.stopPropagation) e.stopPropagation(); if(e && e.stopImmediatePropagation) e.stopImmediatePropagation(); return false; };
      window.addEventListener('contextmenu', handler, true);
      document.addEventListener('contextmenu', handler, true);
    }catch(_){/* ignore */}
  })();</script>\n`,
  localStorage: `\n<script>(function(){
    var originalJSONParse = JSON.parse;
    JSON.parse = function(text) {
      if (text === undefined || text === null || text === 'undefined') {
        return null;
      }
      return originalJSONParse.call(this, text);
    };
    if (window.parent !== window && !window.localStorage) {
      window.localStorage = {
        data: {},
        getItem: function(key) { return this.data[key] || null; },
        setItem: function(key, value) { this.data[key] = String(value); },
        removeItem: function(key) { delete this.data[key]; },
        clear: function() { this.data = {}; },
        get length() { return Object.keys(this.data).length; },
        key: function(index) { return Object.keys(this.data)[index] || null; }
      };
      for (let i = 0; i < Object.keys(window.localStorage.data).length; i++) {
        let key = Object.keys(window.localStorage.data)[i];
        Object.defineProperty(window.localStorage, key, {
          get: function() { return this.getItem(key); },
          set: function(value) { this.setItem(key, value); },
          configurable: true
        });
      }
    }
  })();</script>\n`,
  cursorToggle: `\n<script>(function(){
    try {
      function setCursorVisible(v){
        try{
          var root=document.documentElement; var body=document.body;
          if(v){ root && root.classList.add('cmg-cursor-visible'); body && body.classList.add('cmg-cursor-visible'); }
          else { root && root.classList.remove('cmg-cursor-visible'); body && body.classList.remove('cmg-cursor-visible'); }
        }catch(_){}
      }
      setCursorVisible(false);
      window.addEventListener('message', function(ev){
        try{
          if(!ev || !ev.data) return;
          var msg = ev.data;
          if (msg && msg.cmg === 'cursor') {
            setCursorVisible(!!msg.visible);
          }
        }catch(_){/*ignore*/}
      }, true);
    } catch(_){/* ignore */}
  })();</script>\n`,
  screenshotPreserve: `\n<script>(function(){
    try {
      var origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attrs){
        try{
          if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
            attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
          }
        }catch(_){/* ignore */}
        return origGetContext.call(this, type, attrs);
      };
    } catch(_){/* ignore */}
  })();</script>\n`,
  marker: `\n<script>(function(){
    try {
      window.__CMG_LAUNCHER__ = true;
      window.__CMG__ = Object.freeze({ launcher: true, name: 'codemonkey-games-launcher' });
      try { document.documentElement.setAttribute('data-cmg-launcher', '1'); } catch(_){/* ignore */}
      try { document.documentElement.classList.add('inLauncher'); } catch(_){/* ignore */}
      try {
        if (document.body) document.body.classList.add('inLauncher');
        else document.addEventListener('DOMContentLoaded', function(){ try{ document.body && document.body.classList.add('inLauncher'); }catch(_){/*ignore*/} }, { once: true });
      } catch(_){/* ignore */}
    } catch(_){/* ignore */}
  })();</script>\n`,
  gamepadBlock: `\n<script>(function(){
    try {
      var __cmg_input_blocked = false;
      window.addEventListener('message', function(ev){
        try{
          if(!ev || !ev.data) return;
          var msg = ev.data;
          if (msg && msg.cmg === 'input') { __cmg_input_blocked = !!msg.blocked; }
        }catch(_){/*ignore*/}
      }, true);
      function clonePad(p){
        if (!p) return p;
        var btns = Array.from(p.buttons || []).map(function(){ return { pressed:false, touched:false, value:0 }; });
        var axes = Array.from(p.axes || []).map(function(){ return 0; });
        try {
          return new Proxy(p, {
            get: function(target, prop){
              if (prop === 'buttons') return btns;
              if (prop === 'axes') return axes;
              if (prop === 'connected') return target.connected;
              return target[prop];
            }
          });
        } catch(_) {
          return { id:p.id, index:p.index, mapping:p.mapping, connected:p.connected, timestamp:p.timestamp, buttons:btns, axes:axes };
        }
      }
      var origGet = (Navigator.prototype && Navigator.prototype.getGamepads) || (navigator && navigator.getGamepads);
      if (origGet) {
        var wrapped = function(){
          var r = origGet.call(navigator) || [];
          if (!__cmg_input_blocked) return r;
          try { return Array.from(r).map(clonePad); } catch(_) { return r; }
        };
        try { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable:true, writable:true, value: wrapped }); } catch(_){/* ignore */}
        try { navigator.getGamepads = wrapped; } catch(_){/* ignore */}
      }
    } catch(_){/* ignore */}
  })();</script>\n`,
};

const allInjections = Object.values(injections).join("");

function injectHtml(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + allInjections);
  } else if (/^<!doctype[^>]*>/i.test(html)) {
    return html.replace(/^<!doctype[^>]*>/i, (m) => m + allInjections);
  } else if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => m + allInjections);
  }
  return allInjections + html;
}

async function serveFile(filePath: string, isIndex: boolean): Promise<Response> {
  try {
    let data = await Deno.readFile(filePath);
    let ct = contentType(filePath) ?? "application/octet-stream";

    if (ct === "application/octet-stream") {
      const lower = filePath.toLowerCase();
      if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
        ct = "text/javascript";
      } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        ct = "text/html; charset=utf-8";
      } else if (lower.endsWith(".css")) {
        ct = "text/css";
      }
    }

    if (isIndex) {
      try {
        const html = new TextDecoder().decode(data);
        const injectedHtml = injectHtml(html);
        const encoded = new TextEncoder().encode(injectedHtml);
        const copied = new Uint8Array(encoded.length);
        copied.set(encoded);
        data = copied;
        ct = "text/html; charset=utf-8";
      } catch { /* ignore if not valid html */ }
    }

    return new Response(data, { headers: { "content-type": ct } });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return new Response("Not Found", { status: 404 });
    }
    throw e;
  }
}

export const handler: Handlers = {
  async GET(req: Request, _ctx: HandlerContext) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // --- Static assets from root ---
    if (pathname.startsWith("/static/") || pathname.startsWith("/assets/") || pathname.startsWith("/vendor/")) {
        const filePath = join(ROOT, pathname.substring(1));
        return await serveFile(filePath, false);
    }

    // --- Game serving logic ---
    const serveGameFile = async (gameId: string, relPath: string, isIndex: boolean) => {
        const filePath = join(GAMES_DIR, gameId, relPath);
        return await serveFile(filePath, isIndex);
    };

    // --- Game alias routing: /<gameId>/... -> /games/<gameId>/...
    const segs = pathname.replace(/^\/+/, "").split("/");
    const firstSeg = segs[0] || "";
    const reserved = new Set(["", "static", "assets", "vendor", "api", "games"]);
    if (!reserved.has(firstSeg)) {
        try {
            const st = await Deno.stat(join(GAMES_DIR, firstSeg));
            if (st.isDirectory) {
                const relPath = segs.slice(1).join("/");
                const isIndex = relPath === "" || pathname.endsWith("/");
                return await serveGameFile(firstSeg, isIndex ? "index.html" : relPath, isIndex);
            }
        } catch { /* not a game folder */ }
    }

    // --- /games/ routing ---
    if (pathname.startsWith("/games/")) {
        const relRaw = decodeURIComponent(pathname.replace(/^\/games\//, ""));
        const segs = relRaw.split("/").filter(Boolean);
        const gameId = segs[0] || "";
        if (gameId) {
            try {
                const st = await Deno.stat(join(GAMES_DIR, gameId));
                if (st.isDirectory) {
                    const relPath = segs.slice(1).join("/");
                    const isIndex = relPath === "" || pathname.endsWith("/");
                    return await serveGameFile(gameId, isIndex ? "index.html" : relPath, isIndex);
                }
            } catch { /* not a game folder */ }
        }
    }

    // --- Referer-based routing for assets with weird base paths ---
    const ref = req.headers.get("referer") || req.headers.get("referrer");
    if (ref) {
        try {
            const refUrl = new URL(ref);
            const refPath = refUrl.pathname || "";
            let gameId: string | null = null;
            if (refPath.startsWith("/games/")) {
                gameId = refPath.split("/")[2] || null;
            } else if (/^\/[A-Za-z0-9_-]+\/?/.test(refPath)) {
                const seg = refPath.split("/")[1];
                try {
                    const st = await Deno.stat(join(GAMES_DIR, seg));
                    if (st.isDirectory) gameId = seg;
                } catch { /* not a game folder */ }
            }
            if (gameId) {
                const relPath = pathname.startsWith("/") ? pathname.substring(1) : pathname;
                return await serveGameFile(gameId, relPath, false);
            }
        } catch { /* ignore bad referer */ }
    }

    // --- Fallback to SPA ---
    const indexFile = await Deno.readFile(join(ROOT, "static", "index.html"));
    return new Response(indexFile, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
