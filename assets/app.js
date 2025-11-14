/*
  assets/app.js
  ----
  完整、可替换的前端脚本（用于 Mikephie 图标上传与管理）
  说明：
    - 依赖 index.html 中设置的全局变量：
        window.API_URL        -> 管理 API 根（rename/delete/...）
        window.UPLOAD_API     -> 上传接口（POST multipart/form-data）
        window.JSON_FILE_URL  -> icons.json 可访问地址（优先）
        window.THUMB_BASE     -> 缩略图服务 base URL（无尾斜杠），可选
    - 设计目标：替换你原始的大而杂的 app.js 中的重复函数，保留功能并修复渲染问题
    - 请在替换前备份原文件
*/

/* =================== 全局配置 =================== */
const API_URL       = (typeof window !== 'undefined' && window.API_URL) ? window.API_URL : '';
const UPLOAD_API    = (typeof window !== 'undefined' && window.UPLOAD_API) ? window.UPLOAD_API : '';
const JSON_FILE_URL = (typeof window !== 'undefined' && window.JSON_FILE_URL) ? window.JSON_FILE_URL : '';
const THUMB_BASE    = (typeof window !== 'undefined' && window.THUMB_BASE) ? window.THUMB_BASE.replace(/\/$/, '') : '';

/* =================== 小工具 =================== */
function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
function noOp(){}

/* =================== fetchJsonWithFallback =================== */
/**
 * 尝试多路获取 JSON：
 * 1) 直接 fetch(url)
 * 2) 如果 window.JSON_FILE_URL 不同则尝试它（通常为 Worker 提供的 icons.json）
 * 3) 最后兜底：corsproxy.io（只在最后手段使用）
 */
async function fetchJsonWithFallback(url) {
  // 1: 直接请求
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Direct fetch HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('fetchJsonWithFallback: direct fetch failed:', err && err.message ? err.message : err);
  }
  // 2: 尝试 JSON_FILE_URL (如果提供)
  try {
    if (JSON_FILE_URL && JSON_FILE_URL !== url) {
      const res2 = await fetch(JSON_FILE_URL, { cache: 'no-store' });
      if (!res2.ok) throw new Error('Worker fetch HTTP ' + res2.status);
      return await res2.json();
    }
  } catch (err) {
    console.warn('fetchJsonWithFallback: worker fetch failed:', err && err.message ? err.message : err);
  }
  // 3: 最后兜底：corsproxy（注意：仅当没有其它可用方式）
  try {
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const pres = await fetch(proxy, { cache: 'no-store' });
    if (!pres.ok) throw new Error('Proxy HTTP ' + pres.status);
    const txt = await pres.text();
    // 尝试解析
    try {
      return JSON.parse(txt);
    } catch (errParse) {
      // 可能是 { contents: "..." }
      try {
        const wrapper = JSON.parse(txt);
        if (wrapper && typeof wrapper.contents === 'string') return JSON.parse(wrapper.contents);
        throw new Error('Proxy returned unexpected wrapper');
      } catch (errWrap) {
        throw new Error('Failed to parse proxy response: ' + (errWrap && errWrap.message ? errWrap.message : errWrap));
      }
    }
  } catch (err) {
    console.warn('fetchJsonWithFallback: proxy failed:', err && err.message ? err.message : err);
    throw new Error('All fetch attempts failed: ' + (err && err.message ? err.message : err));
  }
}

/* =================== thumbUrl 工具 =================== */
/**
 * 构造缩略图 URL：
 * - 优先使用 window.THUMB_BASE 路径方式： THUMB_BASE/<encoded-key>?w=...&h=...&format=...
 * - 如果没有 THUMB_BASE，返回 key（可能是绝对 URL）
 */
function thumbUrl(key, size = 180, opts = {}) {
  if (!key) return '';
  const fit = opts.fit || 'cover';
  const q = opts.quality || opts.q || 85;
  const fmt = opts.format || opts.f || 'webp';
  // 如果 key 看起来像 URL 就直接返回构造后的 URL（添加 thumb 参数）
  try {
    const u = new URL(key);
    if (!u.searchParams.get('thumb')) u.searchParams.set('thumb', '1');
    if (!u.searchParams.get('w')) u.searchParams.set('w', String(size));
    u.searchParams.set('format', fmt);
    return u.toString();
  } catch (e) {
    // 不是 URL，再用 THUMB_BASE 或直接返回 key
  }
  if (!THUMB_BASE) return key;
  const encoded = encodeURIComponent(key).replace(/%2F/g, '/');
  return `${THUMB_BASE}/${encoded}?w=${size}&h=${size}&fit=${encodeURIComponent(fit)}&q=${q}&format=${encodeURIComponent(fmt)}`;
}

/* =================== 列表渲染（稳定版） =================== */
let exAll = [], exFiltered = [];

function renderList(list) {
  exAll = Array.isArray(list) ? list : [];
  const box = document.getElementById('existingList') || document.getElementById('existing-list') || null;
  if (!box) {
    console.warn('renderList: missing container #existingList');
    return;
  }
  box.innerHTML = '';

  if (!exAll || exAll.length === 0) {
    box.innerHTML = '<div class="ex-item-placeholder">暂无图片</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'thumb-grid';

  exAll.forEach(item => {
    // 兼容字段 name, file, key, title
    const name = item.name || item.file || item.key || item.title || '';
    const desc = item.desc || item.description || item.summary || '';
    const url = item.url || item.href || item.path || '';
    const key = item.key || item.name || item.file || name || url || '';

    // 生成缩略图 URL 优先级：
    // 1) item.thumb / item.thumbnail / item.preview
    // 2) url + ?thumb=1&w=... (如果 url 存在)
    // 3) THUMB_BASE/<key>
    let turl = '';
    if (item.thumb) turl = item.thumb;
    else if (item.thumbnail) turl = item.thumbnail;
    else if (item.preview) turl = item.preview;
    else if (url) {
      try {
        const u = new URL(url, location.origin);
        if (!u.searchParams.get('thumb')) u.searchParams.set('thumb', '1');
        if (!u.searchParams.get('w')) u.searchParams.set('w', '200');
        turl = u.toString();
      } catch (e) {
        turl = url;
      }
    } else if (THUMB_BASE && key) {
      const kEnc = encodeURIComponent(key).replace(/%2F/g, '/');
      turl = `${THUMB_BASE}/${kEnc}?w=200&h=200&fit=cover&format=webp`;
    } else {
      turl = url || '';
    }

    const card = document.createElement('div');
    card.className = 'thumb-card';
    card.innerHTML = `
      <div class="thumb-img-wrap">
        <img loading="lazy" src="${escapeHtml(turl)}" alt="${escapeHtml(name)}">
      </div>
      <div class="thumb-meta" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div style="font-size:12px;color:#9fb;margin-top:6px">${escapeHtml(desc)}</div>
      <div class="thumb-actions">
        <button class="btn btn-copy" data-url="${escapeHtml(url || turl || key)}">复制 URL</button>
        <button class="btn btn-rename" data-key="${escapeHtml(key)}">重命名</button>
        <button class="btn btn-delete" data-key="${escapeHtml(key)}">删除</button>
      </div>
    `;

    // 图片 onerror fallback
    const img = card.querySelector('img');
    img.addEventListener('error', () => {
      if (img.dataset._tried) return;
      img.dataset._tried = '1';
      if (url && url !== turl) {
        img.src = url;
      } else {
        // 无可用替代，移除 src 并设置背景
        img.src = '';
        img.style.background = 'linear-gradient(180deg,#041426,#07243a)';
      }
    });

    // 复制
    card.querySelector('.btn-copy').addEventListener('click', async (ev) => {
      const u = ev.currentTarget.dataset.url || '';
      try { await navigator.clipboard.writeText(u); alert('已复制'); }
      catch (e) { prompt('复制链接', u); }
    });

    // 重命名
    card.querySelector('.btn-rename').addEventListener('click', async (ev) => {
      const oldKey = ev.currentTarget.dataset.key;
      const newKey = prompt('请输入新文件名（含目录，例如 APP_logo/new.png）:', oldKey || '');
      if (!newKey) return;
      try {
        await renameFile(oldKey, newKey);
        await loadExisting();
        alert('重命名成功');
      } catch (err) {
        console.error('rename error', err);
        alert('重命名失败：' + (err && err.message ? err.message : err));
      }
    });

    // 删除
    card.querySelector('.btn-delete').addEventListener('click', async (ev) => {
      const k = ev.currentTarget.dataset.key;
      if (!k) return alert('无法识别要删除的文件');
      if (!confirm('确定删除 ' + k + ' ?')) return;
      try {
        await deleteFile(k);
        await loadExisting();
        alert('删除成功');
      } catch (err) {
        console.error('delete error', err);
        alert('删除失败：' + (err && err.message ? err.message : err));
      }
    });

    grid.appendChild(card);
  });

  box.appendChild(grid);
}

/* =================== 过滤、搜索 =================== */
function applyFilter() {
  const q = (document.getElementById('exSearch')?.value || '').toLowerCase().trim();
  const p = (document.getElementById('exPrefix')?.value || '').trim();
  const filtered = exAll.filter(it => {
    const name = (it.name || it.file || it.key || '').toString().toLowerCase();
    const path = (it.path || it.key || it.name || '').toString();
    const okQ = q ? name.includes(q) : true;
    const okP = p ? path.startsWith(p) : true;
    return okQ && okP;
  });
  exFiltered = filtered;
  renderList(filtered);
}

/* =================== loadExisting =================== */
async function loadExisting() {
  const box = document.getElementById('existingList') || document.getElementById('existing-list');
  if (box) box.innerHTML = '<div class="ex-item-placeholder">加载中…</div>';
  try {
    if (!JSON_FILE_URL) throw new Error('未配置 JSON_FILE_URL');
    const data = await fetchJsonWithFallback(JSON_FILE_URL);
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data.items)) arr = data.items;
    else if (Array.isArray(data.files)) arr = data.files;
    else if (data && typeof data === 'object') {
      // 将 object -> array 的常见转换
      const keys = Object.keys(data);
      // 如果已经是数组状对象(如 [{...},...]) 则处理
      if (keys.length > 0 && keys.every(k => /^\d+$/.test(k) === false)) {
        arr = keys.map(k => {
          const v = data[k];
          if (typeof v === 'string') return { name: k, url: v };
          if (v && typeof v === 'object') return Object.assign({ name: k }, v);
          return { name: k };
        });
      } else {
        // fallback: try to use as items array
        arr = data.items || [];
      }
    }
    exAll = arr;
    renderList(arr);
  } catch (err) {
    console.error('loadExisting error', err);
    const box = document.getElementById('existingList') || document.getElementById('existing-list');
    if (box) box.innerHTML = `<div class="ex-item-placeholder">读取失败：${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
  }
}

/* =================== deleteFile (调用后端 API) =================== */
async function deleteFile(key) {
  if (!API_URL) throw new Error('未配置 API_URL');
  // POST JSON { action: 'delete', key } 或自定义 endpoint /delete
  try {
    const url = new URL(API_URL, location.origin);
    // 优先尝试 /delete 路径
    url.pathname = (url.pathname.replace(/\/$/, '') + '/delete').replace(/\/\/+/g, '/');
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j && (j.ok === true || j.success === true)) return true;
    // 若返回结构不同，仍认为成功（后端应返回 ok）
    return true;
  } catch (err) {
    console.warn('deleteFile failed on /delete:', err);
    // 回退到 API_URL (直接 POST { action:'delete' })
    try {
      const url2 = new URL(API_URL, location.origin);
      const res2 = await fetch(url2.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', key })
      });
      if (!res2.ok) throw new Error('HTTP ' + res2.status);
      const j2 = await res2.json();
      if (j2 && (j2.ok === true || j2.success === true)) return true;
    } catch (err2) {
      console.error('deleteFile fallback failed:', err2);
      throw err;
    }
  }
}

/* =================== renameFile (调用后端 API) =================== */
async function renameFile(oldKey, newKey) {
  if (!API_URL) throw new Error('未配置 API_URL');
  try {
    const url = new URL(API_URL, location.origin);
    url.pathname = (url.pathname.replace(/\/$/, '') + '/rename').replace(/\/\/+/g, '/');
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldKey, newKey })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j && (j.ok === true || j.success === true)) return true;
    return true;
  } catch (err) {
    console.warn('renameFile failed on /rename:', err);
    // fallback
    try {
      const url2 = new URL(API_URL, location.origin);
      const res2 = await fetch(url2.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', oldKey, newKey })
      });
      if (!res2.ok) throw new Error('HTTP ' + res2.status);
      const j2 = await res2.json();
      if (j2 && (j2.ok === true || j2.success === true)) return true;
    } catch (err2) {
      console.error('renameFile fallback failed:', err2);
      throw err;
    }
  }
}

/* =================== uploadFiles (multipart POST) =================== */
async function uploadFiles(fileList, options = {}) {
  if (!UPLOAD_API) throw new Error('未配置 UPLOAD_API');
  const fd = new FormData();
  for (let i = 0; i < fileList.length; i++) fd.append('files', fileList[i]);
  fd.append('options', JSON.stringify(options || {}));
  // 允许后端返回 { ok:true, uploaded: [...] }
  const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Upload HTTP ' + res.status);
  const j = await res.json();
  return j;
}

/* =================== 页面事件绑定 =================== */
function attachUi() {
  // browse/upload controls
  const browseBtn = document.getElementById('browseBtn');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const resultEl = document.getElementById('result');

  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files;
      if (!f || f.length === 0) {
        resultEl && (resultEl.textContent = '未选择文件');
        return;
      }
      resultEl && (resultEl.textContent = `${f.length} 个文件已选择`);
    });
  }
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', async () => {
      const f = fileInput.files;
      if (!f || f.length === 0) return alert('请选择文件后再上传');
      const opts = {
        size: Number(document.getElementById('optSize')?.value || 500),
        mode: (document.querySelector('input[name="mode"]:checked') || { value: 'original' }).value,
        dir: (document.getElementById('optDir')?.value || 'APP_logo'),
        overwrite: document.getElementById('optOverwrite')?.checked || false
      };
      try {
        resultEl && (resultEl.textContent = '上传中...');
        const res = await uploadFiles(f, opts);
        resultEl && (resultEl.textContent = '上传完成');
        await loadExisting();
        return res;
      } catch (err) {
        console.error('upload error', err);
        resultEl && (resultEl.textContent = '上传失败');
        alert('上传失败：' + (err && err.message ? err.message : err));
        throw err;
      }
    });
  }

  // refresh & copy json
  document.getElementById('refreshExisting')?.addEventListener('click', () => loadExisting());
  document.getElementById('copyJsonLinkBtn')?.addEventListener('click', async () => {
    if (!JSON_FILE_URL) return alert('未配置 JSON_FILE_URL');
    try { await navigator.clipboard.writeText(JSON_FILE_URL); alert('已复制 icons.json 链接'); }
    catch { prompt('icons.json 链接', JSON_FILE_URL); }
  });

  // search & prefix filter
  document.getElementById('exSearch')?.addEventListener('input', () => applyFilter());
  document.getElementById('exPrefix')?.addEventListener('change', () => applyFilter());
}

/* =================== 自动启动 =================== */
document.addEventListener('DOMContentLoaded', () => {
  attachUi();
  loadExisting().catch(e => console.warn('initial loadExisting failed', e));
});

/* =================== 导出便于调试 =================== */
window.fetchJsonWithFallback = fetchJsonWithFallback;
window.thumbUrl = thumbUrl;
window.loadExisting = loadExisting;
window.renderList = renderList;
window.uploadFiles = uploadFiles;
window.renameFile = renameFile;
window.deleteFile = deleteFile;
