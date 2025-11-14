export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));
    const width = url.searchParams.get("w");

    // R2 获取文件对象
    let object = await env.IMAGES.get(key);

    // Fallback 逻辑 (和您的一样)
    if (!object) {
      object = await env.IMAGES.get("not-found.png");
      if (!object) return new Response("File not found", { status: 404 });
    }

    // --- 优化点开始 ---

    const headers = new Headers();

    // 1. (推荐) 自动设置 R2 对象的元数据 (Content-Type, ETag等)
    // 这比 object.httpMetadata?.contentType 更健壮
    object.writeHttpMetadata(headers);

    // 2. 覆盖或添加我们自己的强缓存
    headers.set("Cache-Control", "public, max-age=31536000");

    // 如果有 width 参数，只返回提示信息（和您的一样）
    if (width) {
      headers.set("X-Notice", `Image resize not supported on this Worker (width=${width})`);
    }

    // 3. (核心) 直接流式传输 body，而不是等待 arrayBuffer
    // 这几乎是瞬时的，并且内存占用极低
    return new Response(object.body, {
      headers,
    });
    
    // --- 优化点结束 ---
  }
}
