/*
  完整前端脚本（assets/app.js）
  - 已包含：fetchJsonWithFallback, thumbUrl, loadExisting, renderList
  - 上传/删除/重命名的前端调用实现为对 window.UPLOAD_API / window.API_URL 的 HTTP 请求（你需在后端实现）
  - 请在 index.html 中正确配置 window.API_URL / window.UPLOAD_API / window.JSON_FILE_URL / window.THUMB_BASE
*/

/* =================== 配置 & 常量 =================== */
const API_URL       = (typeof window !== 'undefined' && window.API_URL) ? window.API_URL : '';
const UPLOAD_API    = (typeof window !== 'undefined' && window.UPLOAD_API) ? window.UPLOAD_API : '';
const JSON_FILE_URL = (typeof window !== 'undefined' && window.JSON_FILE_URL) ? window.JSON_FILE_URL : '';
const THUMB_BASE    = (typeof window !== 'undefined' && window.THUMB_BASE) ? window.THUMB_BASE.replace(/\/$/, '') : '';

/* =================== 基础工具函数 =================== */
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/* 从 item 中推断 key（R2 object key） */
function keyFromItem(it) {
  if (!it) return '';
  if (typeof it === 'string') return it;
  if (it.key) return it.key;
  if (it.path) return it.path;
  if (it.name) return it.name;
  if (it.file) return it.file;
  if (it.url) {
    try {
      const u = new URL(it.url);
      return safeDecode(u.pathname.replace(/^\/+/, ''));
    } catch {
      // 尝试简单移除域名
      return safeDecode(String(it.url).replace(/^https?:\/\/[^/]+\/+/, ''));
    }
  }
  return '';
}

/* =================== JSON 获取：多路回退 =================== */
async function fetchJsonWithFallback(url) {
  // 1. 直接 fetch
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Direct fetch HTTP ' + r.status);
    return await r.json();
  } catch (err) {
    console.warn('fetchJsonWithFallback: direct failed', err && err.message ? err.message : err);
  }

  // 2. 尝试 window.JSON_FILE_URL（如果不同）
  try {
    if (JSON_FILE_URL && JSON_FILE_URL !== url) {
      const r2 = await fetch(JSON_FILE_URL, { cache: 'no-store' });
      if (!r2.ok) throw new Error('Worker fetch HTTP ' + r2.status);
      return await r2.json();
    }
  } catch (err) {
    console.warn('fetchJsonWithFallback: worker fetch failed', err && err.message ? err.message : err);
  }

  // 3. 最后兜底：corsproxy.io（一次读取 text）
  try {
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const pres = await fetch(proxy, { cache: 'no-store' });
    if (!pres.ok) throw new Error('Proxy HTTP ' + pres.status);
    const txt = await pres.text();
    try {
      return JSON.parse(txt);
    } catch (errParse) {
      // 代理可能返回 { contents: "..." }
      try {
        const wrap = JSON.parse(txt);
        if (wrap && typeof wrap.contents === 'string') return JSON.parse(wrap.contents);
        throw new Error('Proxy returned unexpected wrapper');
      } catch (errWrap) {
        throw new Error('Failed to parse proxy response: ' + (errWrap && errWrap.message ? errWrap.message : errWrap));
      }
    }
  } catch (err) {
    console.warn('fetchJsonWithFallback: proxy failed', err && err.message ? err.message : err);
    throw new Error('All fetch attempts failed: ' + (err && err.message ? err.message : err));
  }
}

/* =================== 缩略图 URL 工具 =================== */
/**
 * thumbUrl(key, size, opts)
 *  - key: R2 对象 key，如 "APP_logo/abc.png"
 *  - size: 正方形尺寸（默认 180）
 *  - opts: { fit, quality, format }
 *
 * 返回 Worker 缩略图 URL（假定 Worker 支持 path-syntax: THUMB_BASE/<encoded-key>?w=..&h=..）
 */
function thumbUrl(key, size = 180, opts = {}) {
  if (!key) return '';
  const fit = opts.fit || 'cover';
  const q = opts.quality || opts.q || 85;
  const fmt = opts.format || opts.f || 'webp';
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
  // 使用 path 形式：THUMB_BASE/<key>?w=...&h=...&format=...
  if (!THUMB_BASE) {
    // 如果没有 THUMB_BASE，尝试返回 key（可能是绝对 URL）
    return key;
  }
  return `${THUMB_BASE}/${encodedKey}?w=${size}&h=${size}&fit=${encodeURIComponent(fit)}&q=${q}&format=${encodeURIComponent(fmt)}`;
}

/* =================== 列表渲染（带 thumb 优先） =================== */
let exAll = [], exFiltered = [];

function renderList(list) {
  exAll = list || [];
  const box = document.getElementById('existingList');
  if (!box) return;
  box.innerHTML = '';

  if (!list || list.length === 0) {
    box.innerHTML = '<div style="padding:12px;color:#9aa">无图片</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'thumb-grid';

  list.forEach(it => {
    // 兼容多种字段
    const name = it.name || it.file || it.key || '';
    const url = it.url || it.href || '';
    const key = keyFromItem(it) || name;

    // 优先字段
    let turl = null;
    if (it.thumb) turl = it.thumb;
    else if (it.thumbnail) turl = it.thumbnail;
    else if (it.preview) turl = it.preview;
    else if (url) {
      // 如果 url 可用，尝试在 url 上添加 thumb 参数（若你的服务器或 CDN/Worker 支持）
      try {
        const u = new URL(url);
        if (!u.searchParams.get('thumb')) u.searchParams.set('thumb', '1');
        if (!u.searchParams.get('w')) u.searchParams.set('w', '200');
        turl = u.toString();
      } catch (e) {
        turl = url;
      }
    } else if (THUMB_BASE && key) {
      // 如果没有 url，构造 thumb path
      turl = `${THUMB_BASE}/${encodeURIComponent(key)}?w=200&h=200&fit=cover&format=webp`;
    }

    const card = document.createElement('div');
    card.className = 'thumb-card';
    const displayName = escapeHtml(name || key);

    card.innerHTML = `
      <div class="thumb-img-wrap">
        <img loading="lazy" src="${turl || url || ''}" alt="${displayName}" onerror="(function(e){try{const img=e&&e.target; if(!img) return; if(img.dataset.fallback) return; img.dataset.fallback='1'; if('${url}') img.src='${url}'; }catch(_){}})(event)">
      </div>
      <div class="thumb-meta" title="${displayName}">${displayName}</div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="btn copy-btn">复制 URL</button>
        <button class="btn rename-btn">重命名</button>
        <button class="btn del-btn">删除</button>
      </div>
    `;

    // 事件绑定
    card.querySelector('.copy-btn').addEventListener('click', async () => {
      const clip = url || (THUMB_BASE ? `${THUMB_BASE}/${encodeURIComponent(key)}` : key);
      try { await navigator.clipboard.writeText(clip); alert('已复制'); } catch { prompt('复制链接', clip); }
    });

    card.querySelector('.rename-btn').addEventListener('click', () => {
      const newName = prompt('新的文件名（包含目录，例如 APP_logo/new.png ）:', key);
      if (!newName) return;
      renameFile(key, newName).then(()=> loadExisting());
    });

    card.querySelector('.del-btn').addEventListener('click', () => {
      if (!confirm('确定删除 ' + (name || key) + ' ?')) return;
      deleteFile(key).then(()=> loadExisting());
    });

    grid.appendChild(card);
  });

  box.appendChild(grid);
}

/* =================== 过滤与搜索 =================== */
function applyFilter() {
  const q = (document.getElementById('exSearch')?.value || '').toLowerCase().trim();
  const p = (document.getElementById('exPrefix')?.value || '').trim();

  let filtered = exAll.filter(it => {
    const name = (it.name || it.key || it.file || '').toString().toLowerCase();
    const path = (it.path || it.key || it.name || '').toString();
    const okQ = q ? name.includes(q) : true;
    const okP = p ? path.startsWith(p) : true;
    return okQ && okP;
  });

  exFiltered = filtered;
  renderList(filtered);
}

/* =================== 拉取 icons.json 并渲染 =================== */
async function loadExisting() {
  const existingListElem = document.getElementById('existingList');
  if (existingListElem) existingListElem.innerHTML = '<div style="padding:10px;color:#9aa">加载中…</div>';
  try {
    const data = await fetchJsonWithFallback(JSON_FILE_URL);
    let arr = [];

    // 兼容多种结构
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data.items)) arr = data.items;
    else if (Array.isArray(data.files)) arr = data.files;
    else if (data && typeof data === 'object') {
      // 把 object 转成数组
      // 支持 { "APP_logo/xxx.png": { url: "...", thumb: "..." } }
      const keys = Object.keys(data);
      const maybeArr = keys.map(k => {
        const v = data[k];
        if (typeof v === 'string') return { name: k, url: v };
        if (v && typeof v === 'object') return Object.assign({ name: k }, v);
        return { name: k };
      });
      arr = maybeArr;
    }

    exAll = arr;
    applyFilter();
  } catch (err) {
    console.error('loadExisting error', err);
    if (existingListElem) existingListElem.innerHTML = `<div style="padding:12px;color:#f88">读取失败：${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
  }
}

/* =================== 删除文件（调用 API） =================== */
async function deleteFile(key) {
  if (!API_URL) { alert('未配置 API_URL'); return; }
  try {
    const url = new URL(API_URL);
    url.pathname = (url.pathname.replace(/\/$/, '') + '/delete').replace(/\/\/+/g, '/');
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j && j.ok) return true;
    return true;
  } catch (err) {
    alert('删除失败：' + (err && err.message ? err.message : err));
    console.error(err);
    throw err;
  }
}

/* =================== 重命名文件（调用 API） =================== */
async function renameFile(oldKey, newKey) {
  if (!API_URL) { alert('未配置 API_URL'); return; }
  try {
    const url = new URL(API_URL);
    url.pathname = (url.pathname.replace(/\/$/, '') + '/rename').replace(/\/\/+/g, '/');
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldKey, newKey })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j && j.ok) return true;
    return true;
  } catch (err) {
    alert('重命名失败：' + (err && err.message ? err.message : err));
    console.error(err);
    throw err;
  }
}

/* =================== 上传逻辑（示例） =================== */
/*
  前端上传示例实现：
  - UPLOAD_API: 接受 multipart/form-data 的 endpoint（后端实现上传到 R2 并更新 icons.json）
  - 这里我们将文件与选项发给 UPLOAD_API，后端返回 { ok:true, file:key, url:... }
*/
async function uploadFiles(files, options = {}) {
  if (!UPLOAD_API) { alert('未配置 UPLOAD_API'); return; }

  const fd = new FormData();
  for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
  // 添加选项
  fd.append('options', JSON.stringify(options));

  const resultElem = document.getElementById('result');
  try {
    resultElem && (resultElem.textContent = '上传中...');
    const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload HTTP ' + res.status);
    const j = await res.json();
    resultElem && (resultElem.textContent = '上传完成');
    // 上传完成后刷新列表
    await loadExisting();
    return j;
  } catch (err) {
    resultElem && (resultElem.textContent = '上传失败');
    console.error('uploadFiles error', err);
    alert('上传失败：' + (err && err.message ? err.message : err));
    throw err;
  }
}

/* =================== 页面绑定 =================== */
document.addEventListener('DOMContentLoaded', () => {
  // 上传相关控件
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const resultElem = document.getElementById('result');

  browseBtn && browseBtn.addEventListener('click', () => fileInput && fileInput.click());
  fileInput && fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // 显示简要文件名
    resultElem && (resultElem.textContent = `${files.length} 个文件准备上传`);
  });

  uploadBtn && uploadBtn.addEventListener('click', async () => {
    const files = fileInput && fileInput.files;
    if (!files || files.length === 0) { alert('请选择文件'); return; }
    // 获取一些选项（示例）
    const options = {
      size: Number(document.getElementById('optSize')?.value || 500),
      mode: (document.querySelector('input[name="mode"]:checked') || { value: 'original' }).value,
      dir: (document.getElementById('optDir')?.value || 'APP_logo'),
      overwrite: document.getElementById('optOverwrite')?.checked || false
    };
    try {
      await uploadFiles(files, options);
    } catch (err) {
      console.error(err);
    }
  });

  // 列表刷新 / 复制 json 链接 / 过滤
  document.getElementById('refreshExisting')?.addEventListener('click', () => loadExisting());
  document.getElementById('copyJsonLinkBtn')?.addEventListener('click', async () => {
    if (!JSON_FILE_URL) { alert('未配置 JSON_FILE_URL'); return; }
    try { await navigator.clipboard.writeText(JSON_FILE_URL); alert('已复制 icons.json 链接'); } catch { prompt('icons.json', JSON_FILE_URL); }
  });

  document.getElementById('exSearch')?.addEventListener('input', () => applyFilter());
  document.getElementById('exPrefix')?.addEventListener('change', () => applyFilter());

  // 首次加载
  loadExisting().catch(() => {});
});

/* =================== 导出（调试用） =================== */
window.fetchJsonWithFallback = fetchJsonWithFallback;
window.thumbUrl = thumbUrl;
window.loadExisting = loadExisting;
