export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    /* ====== 配置 ====== */
    const BUCKET     = env.IMAGES;                         // R2 Bucket
    const ICONS_KEY  = "icons.json";
    const PUBLIC_BASE= "https://images.mikephie.com";
    const ALLOW_EXT  = [".png",".jpg",".jpeg",".gif",".webp",".svg",".ico",".bmp"];

    /* ====== CORS ====== */
    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    /* ====== 工具 ====== */
    const getExt = n => (n.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
    const isImageKey = k => k !== ICONS_KEY && ALLOW_EXT.includes(getExt(k));
    const makePublicUrl = key => `${PUBLIC_BASE}/${key}`;

    function normalizeKey(k){
      k = (k || "").replace(/\\/g, "/");
      k = k.replace(/^\/+/, "");
      k = k.replace(/\/{2,}/g, "/");
      return k;
    }
    // 把传入的 key/URL 统一还原成 R2 里的“中文真实 key”
    function materializeKey(input){
      if (!input) return "";
      let raw = String(input).trim();
      try { const u = new URL(raw); raw = u.pathname || raw; } catch {}
      raw = raw.replace(/^\/+/, "");
      try { raw = decodeURIComponent(raw); } catch {}
      return normalizeKey(raw);
    }
    const jsonResponse = (obj, status=200) =>
      new Response(JSON.stringify(obj, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

    async function listAllObjects(prefix=""){
      const out=[]; let cursor;
      do {
        const r = await BUCKET.list({ prefix, cursor, limit: 1000 });
        (r.objects||[]).forEach(o => out.push(o));
        cursor = r.truncated ? r.cursor : undefined;
      } while (cursor);
      return out;
    }
    async function rebuildIcons(){
      const all = await listAllObjects("");
      const imgs = all.filter(o => isImageKey(o.key));
      const icons = imgs.map(o => ({ name:o.key, url:makePublicUrl(o.key) }));
      icons.sort((a,b)=>a.name.localeCompare(b.name));
      return icons;
    }
    async function saveIconsJson(icons){
      const payload = { title:"Mikephie图标订阅", desc:"收集一些自己脚本用到的图标", updatedAt:new Date().toISOString(), count:icons.length, icons };
      await BUCKET.put(ICONS_KEY, JSON.stringify(payload, null, 2), {
        httpMetadata: { contentType:"application/json; charset=utf-8", cacheControl:"no-store" },
      });
      return payload;
    }

    /* ====== DELETE ====== */
    if (method === "DELETE") {
      try{
        const key = materializeKey(url.searchParams.get("key"));
        if (!key) return jsonResponse({ ok:false, error:"Missing key" }, 400);
        if (key === ICONS_KEY) return jsonResponse({ ok:false, error:"icons.json cannot be deleted" }, 400);

        const head = await BUCKET.head(key);
        if (!head) return jsonResponse({ ok:false, error:"File not found", key }, 404);

        await BUCKET.delete(key);
        const saved = await saveIconsJson(await rebuildIcons());
        return jsonResponse({ ok:true, deleted:key, remaining:saved.count });
      }catch(e){
        return jsonResponse({ ok:false, error:String(e?.message || e) }, 500);
      }
    }

    /* ====== POST ====== */
    if (method === "POST") {
      try{
        const ct = request.headers.get("content-type") || "";

        // 非 multipart：动作类
        if (!ct.includes("multipart/form-data")) {
          const form = await request.formData().catch(()=>null);
          const action = form?.get("action");

          if (action === "refresh-icons") {
            const saved = await saveIconsJson(await rebuildIcons());
            return jsonResponse({ ok:true, refreshed:true, count:saved.count });
          }

          if (action === "rename") {
            const oldKey = materializeKey(form?.get("oldKey"));
            const newKey = materializeKey(form?.get("key"));
            if (!oldKey || !newKey) return jsonResponse({ ok:false, error:"Missing oldKey/key" }, 400);
            if (oldKey === ICONS_KEY || newKey === ICONS_KEY) return jsonResponse({ ok:false, error:"icons.json cannot be renamed" }, 400);

            const obj = await BUCKET.get(oldKey);
            if (!obj) return jsonResponse({ ok:false, error:"File not found", key:oldKey }, 404);

            const body = await obj.arrayBuffer();
            await BUCKET.put(newKey, body, {
              httpMetadata: { contentType: obj.httpMetadata?.contentType || "application/octet-stream" },
            });
            await BUCKET.delete(oldKey);

            const saved = await saveIconsJson(await rebuildIcons());
            return jsonResponse({ ok:true, renamed:{from:oldKey,to:newKey}, count:saved.count });
          }

          return jsonResponse({ ok:false, error:"Unknown POST action" }, 400);
        }

        // multipart：上传
        const form = await request.formData();
        const file = form.get("file");
        if (!file || typeof file === "string") return jsonResponse({ ok:false, error:"Missing file" }, 400);

        let reqKey = materializeKey(form.get("key") || file.name);
        if (!reqKey) return jsonResponse({ ok:false, error:"Bad key" }, 400);
        if (!isImageKey(reqKey)) return jsonResponse({ ok:false, error:`Unsupported file type (allow: ${ALLOW_EXT.join(", ")})` }, 400);

        const allowOverwrite = (form.get("overwrite") || "true").toString() === "true";
        if (!allowOverwrite) {
          const exist = await BUCKET.head(reqKey);
          if (exist) {
            const dot = reqKey.lastIndexOf(".");
            const base = dot>-1 ? reqKey.slice(0,dot) : reqKey;
            const ext  = dot>-1 ? reqKey.slice(dot)   : "";
            reqKey = `${base}_${Math.random().toString(36).slice(2,7)}${ext}`;
          }
        }

        await BUCKET.put(reqKey, file.stream(), {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
        });

        const saved = await saveIconsJson(await rebuildIcons());
        return jsonResponse({ ok:true, keyUsed:reqKey, url:makePublicUrl(reqKey), totalIcons:saved.count });
      }catch(e){
        return jsonResponse({ ok:false, error:String(e?.message || e) }, 500);
      }
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
}