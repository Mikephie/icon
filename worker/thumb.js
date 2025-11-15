// --- 最终完整版 (V2) ---
//
// 此版本使用 R2 + Image Transformations (cf: image)
//
// 必备条件:
// 1. 绑定: 只需要 R2_BUCKET。
// 2. DNS: CNAME 记录必须是“橙色云朵”(Proxied)。
// 3. 服务: 必须在域名上启用 "Images" -> "Transformations"。
//
export default {
  /**
   * @param {Request} request
   * @param {object} env
   */
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // 1. 从 URL 获取 file 参数
      const file = url.searchParams.get('file');
      if (!file) {
        // [调试信息] 确认 V2 脚本已部署
        return new Response('V2 Script Deployed - Error: Missing file param', { 
          status: 400, 
          headers: corsHeaders() 
        });
      }

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
 */
function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}
