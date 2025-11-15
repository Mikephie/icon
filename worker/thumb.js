<<<<<<< HEAD
// --- 最终完整版 (V2) ---
//
// 此版本使用 R2 + Image Transformations (cf: image)
//
// 必备条件:
// 1. 绑定: 只需要 R2_BUCKET。
// 2. DNS: CNAME 记录必须是“橙色云朵”(Proxied)。
// 3. 服务: 必须在域名上启用 "Images" -> "Transformations"。
//
=======
// thumb.js (最终版本 - 包含边缘缓存和 Cache-Tag)
// 说明：需要在 Worker Bindings 中添加：
//  - R2 binding 名称: R2_BUCKET
//  - Images binding 名称: IMAGE
// 部署后在 DNS/Routes 上将 icon.mikephie.com/thumb* 指向此 Worker

>>>>>>> 750012beca99ee86efe8b5a5d34daceb742aac72
export default {
  /**
   * @param {Request} request
   * @param {object} env
<<<<<<< HEAD
   */
  async fetch(request, env) {
=======
   * @param {object} context
   */
  async fetch(request, env, context) {
>>>>>>> 750012beca99ee86efe8b5a5d34daceb742aac72
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

<<<<<<< HEAD
      // 1. 从 URL 获取 file 参数
      const file = url.searchParams.get('file');
      if (!file) {
        // [调试信息] 确认 V2 脚本已部署
        return new Response('V2 Script Deployed - Error: Missing file param', { 
          status: 400, 
          headers: corsHeaders() 
        });
      }
=======
      // 必填：file（R2 key）
      const file = params.get('file');
      if (!file) return new Response('Missing file param', { status: 400 });
>>>>>>> 750012beca99ee86efe8b5a5d34daceb742aac72

      // 2. 从 R2 获取原始对象
      const obj = await env.R2_BUCKET.get(file);
      if (!obj) {
        return new Response('Not found in R2', { status: 404, headers: corsHeaders() });
      }

      // 3. 从 URL 获取缩放选项
      const w = url.searchParams.get('w') || url.searchParams.get('width') || '200';
      const h = url.searchParams.get('h') || url.searchParams.get('height') || w;
      const fit = url.searchParams.get('fit') || 'cover';
      const quality = url.searchParams.get('quality') || '80';
      const fmt = url.searchParams.get('f') || url.searchParams.get('format') || 'webp';

<<<<<<< HEAD
      // 4. 构建 Cloudflare Image Resizing 选项
      const resizeOptions = {
        width: w,
        height: h,
        fit: fit,
        quality: quality,
        format: fmt
      };

      // 5. 准备响应头
      const headers = new Headers({
        'Content-Type': `image/${fmt}`,
        'Cache-Control': 'public, max-age=86400', 
=======
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
>>>>>>> 750012beca99ee86efe8b5a5d34daceb742aac72
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      });
      if(obj.httpEtag) {
        headers.set('etag', obj.httpEtag);
      }
      
      // 6. [核心] 返回响应
      // 我们将 R2 的原始文件 (obj.body) 返回，
      // 并在 cf 选项中加入 image: resizeOptions。
      // 只有在“橙色云朵”下，Cloudflare 才会执行此缩放。
      return new Response(obj.body, {
        headers,
        cf: {
          image: resizeOptions
        }
      });

<<<<<<< HEAD
=======
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

>>>>>>> 750012beca99ee86efe8b5a5d34daceb742aac72
    } catch (err) {
      return new Response('Error: ' + (err && err.message ? err.message : String(err)), {
        status: 500,
        headers: corsHeaders()
      });
    }
  }
};

/**
 * 辅助函数：返回 CORS 头部
<<<<<<< HEAD
=======
 * @returns {Headers}
>>>>>>> 750012beca99ee86efe8b5a5d34daceb742aac72
 */
function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}
