// r2-icon-api.js (enhanced)
addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

const ALLOWED_ORIGIN = 'https://icon.mikephie.com'; // 或 '*' 以允许任意来源

async function handle(request) {
  // 处理 preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const url = new URL(request.url);
    // 去掉开头的斜杠
    let key = url.pathname.replace(/^\/+/, '');

    // 如果没有 key，则默认返回 icons.json（方便用根域名直接访问）
    if (!key) {
      key = 'icons.json';
    }

    // 从 R2 读取对象
    const obj = await IMAGES.get(key);
    if (!obj) {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    // 读取 body（一次性）
    const body = await obj.arrayBuffer();

    // 内容类型：优先用 httpMetadata.contentType（若上传时设置了）
    const contentType = (obj && obj.httpMetadata && obj.httpMetadata.contentType)
      ? obj.httpMetadata.contentType
      : detectContentType(key);

    const headers = corsHeaders();
    headers.set('Content-Type', contentType);
    headers.set('Content-Length', String(body.byteLength));
    // 建议启用合理的缓存策略（根据需要调整）
    headers.set('Cache-Control', 'public, max-age=60'); // 60s 缓存，按需调整

    return new Response(body, { status: 200, headers });
  } catch (err) {
    // 返回可读的错误信息（并保持 CORS 头），便于前端排查
    const msg = (err && err.message) ? err.message : String(err);
    return new Response('Error: ' + msg, { status: 500, headers: corsHeaders() });
  }
}

function corsHeaders() {
  const h = new Headers();
  // 如果你要允许任意来源，改成 '*'；更安全是使用 ALLOWED_ORIGIN
  h.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN || '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return h;
}

function detectContentType(key) {
  const lower = (key || '').toLowerCase();
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}
