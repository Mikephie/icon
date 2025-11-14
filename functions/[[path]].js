// 文件名: /functions/[[path]].js

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Pages 已经查找了静态文件 (index.html) 并且失败了
  //    所以这个函数被激活了。我们直接从 R2 获取图片。
  const key = decodeURIComponent(url.pathname.slice(1));

  if (!key || key === "favicon.ico") {
    return new Response("Not Found", { status: 404 });
  }

  // 2. 执行从 R2 获取图片的逻辑 (变量名 IMAGES 已确认)
  let object = await env.IMAGES.get(key);

  // Fallback 逻辑
  if (!object) {
    object = await env.IMAGES.get("not-found.png"); 
    if (!object) {
      return new Response("File not found in R2", { status: 404 });
    }
  }

  // 3. 流式传输 R2 对象
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000");

  return new Response(object.body, {
    headers,
  });
}
