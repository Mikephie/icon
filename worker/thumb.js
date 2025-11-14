// thumb.js (最终版本 - 包含边缘缓存和 Cache-Tag)
// 说明：需要在 Worker Bindings 中添加：
//  - R2 binding 名称: R2_BUCKET
//  - Images binding 名称: IMAGE
// 部署后在 DNS/Routes 上将 icon.mikephie.com/thumb* 指向此 Worker

export default {
  /**
   * @param {Request} request
   * @param {object} env
   * @param {object} context
   */
  async fetch(request, env, context) {
    try {
      // 1. [优化] 检查边缘缓存
      const cache = caches.default;
      let response = await cache.match(request);
      
      if (response) {
        // 缓存命中，直接返回
        // console.log('Cache HIT');
        return response;
      }
      // console.log('Cache MISS');


      // --- 缓存未命中，执行原始逻辑 ---
      const url = new URL(request.url);
      const params = url.searchParams;

      // 必填：file（R2 key）
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
      const resizeOptions = {
        width: w,
        height: h,
        fit,
        quality,
        format: fmt === 'auto' ? 'webp' : fmt
      };

      const resized = await env.IMAGE.resize(original, resizeOptions);

      // 根据输出格式决定 Content-Type
      let contentType = 'image/webp';
      if (resizeOptions.format === 'jpeg' || resizeOptions.format === 'jpg') contentType = 'image/jpeg';
      if (resizeOptions.format === 'png') contentType = 'image/png';
      if (resizeOptions.format === 'webp') contentType = 'image/webp';
      
      // 准备响应头
      const headers = new Headers({
        'Content-Type': contentType,
        // 浏览器缓存 1 天, 后台刷新 1 小时
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600', 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      });

      // 2. [优化] 添加 Cache-Tag 以便后续清除
      // 我们使用 R2 的 file key 作为标签，并替换掉无效字符
      const cacheTag = 'r2-file::' + file.replace(/[^a-zA-Z0-9_\-.:]/g, '_');
      headers.set('Cache-Tag', cacheTag);

      // 3. 构造新响应
      response = new Response(resized, { status: 200, headers });

      // 4. [优化] 将响应存入边缘缓存（异步执行，不阻塞返回）
      context.waitUntil(cache.put(request, response.clone()));

      // 5. 返回响应
      return response;

    } catch (err) {
      // 任何错误也返回 CORS header，方便前端调试
      return new Response('Error: ' + (err && err.message ? err.message : String(err)), {
        status: 500,
        headers: corsHeaders()
      });
    }
  }
};

/**
 * 辅助函数：返回 CORS 头部
 * @returns {Headers}
 */
function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}
