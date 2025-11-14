// 文件名: _middleware.js (放在您项目代码的根目录)

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 1. 关键：首先尝试让 Pages 查找静态文件 (index.html, app.js, /)
  const response = await next();

  // 2. 如果 Pages 找到了静态文件 (e.g., 200 OK)，则直接返回它
  if (response.status !== 404) {
    return response;
  }

  // 3. 如果是 404 (文件未找到)，我们假定它是一个图片请求
  const key = decodeURIComponent(url.pathname.slice(1));

  if (!key || key === "favicon.ico") {
    return new Response("Not Found", { status: 404 });
  }

  // 4. [已修正] 执行从 R2 获取图片的逻辑
  //    使用您脚本中确认的 "IMAGES" 变量
  let object = await env.IMAGES.get(key); // 

  // Fallback 逻辑
  if (!object) {
    object = await env.IMAGES.get("not-found.png"); // 
    if (!object) {
      return new Response("File not found in R2", { status: 404 });
    }
  }

  // 5. 流式传输 R2 对象
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000");

  return new Response(object.body, {
    headers,
  });
}