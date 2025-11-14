// thumb.js
// 说明：需要在 Worker Bindings 中添加：
//  - R2 binding 名称: R2_BUCKET (绑定到你的 R2 bucket，例如 "images")
//  - Images binding 名称: IMAGE    (启用 Cloudflare Images API for Workers)
// 部署后在 DNS/Routes 上将 icon.mikephie.com/thumb* 指向此 Worker（域名需被 Cloudflare 代理）

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const params = url.searchParams;

      // 必填：file（R2 key），例如 "TV_logo/1024x1024bb.png"
      const file = params.get('file');
      if (!file) return new Response('Missing file param', { status: 400 });

      // 可选参数
      const w = Math.max(1, parseInt(params.get('w') || params.get('width') || '200'));
      const h = Math.max(1, parseInt(params.get('h') || params.get('height') || String(w)));
      const fit = params.get('fit') || 'cover'; // cover / contain / scale-down / crop
      const quality = Math.min(100, Math.max(10, parseInt(params.get('quality') || '80')));
      const fmt = (params.get('format') || params.get('f') || 'webp').toLowerCase(); // webp / jpeg / png / auto

      // 读取 R2 对象
      const obj = await env.R2_BUCKET.get(file);
      if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders() });

      const original = await obj.arrayBuffer();

      // 使用 Cloudflare Images API (Worker内置) 进行缩放
      // 必须在 Worker Bindings 中启用 IMAGE binding
      const resizeOptions = {
        width: w,
        height: h,
        fit,                // 'cover' 推荐用于图标（等比裁剪填满）
        quality,            // 质量
        // format: fmt === 'auto' ? 'webp' : fmt, // auto -> webp as default
        format: fmt === 'auto' ? 'webp' : fmt
      };

      // env.IMAGE.resize 会返回 ArrayBuffer 或 Uint8Array
      const resized = await env.IMAGE.resize(original, resizeOptions);

      // 根据输出格式决定 Content-Type
      let contentType = 'image/webp';
      if (resizeOptions.format === 'jpeg' || resizeOptions.format === 'jpg') contentType = 'image/jpeg';
      if (resizeOptions.format === 'png') contentType = 'image/png';
      if (resizeOptions.format === 'webp') contentType = 'image/webp';

      // 返回结果并带上缓存与 CORS
      const headers = new Headers({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600', // 缓存 1 天
        'Access-Control-Allow-Origin': '*', // 如需更严格请改成你的域名
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      });

      return new Response(resized, { status: 200, headers });
    } catch (err) {
      // 任何错误也返回 CORS header，方便前端调试
      return new Response('Error: ' + (err && err.message ? err.message : String(err)), {
        status: 500,
        headers: corsHeaders()
      });
    }
  }
};

function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}
