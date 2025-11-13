/* ====== 配置 ====== */
// 静默复制 & 背景刷新：true=先复制, 刷新在后台；false=先刷新再复制
window.COPY_STEALTH = false;

// 成功复制时的反馈级别：'none' | 'toast' | 'text'
window.COPY_FEEDBACK = 'text';

const API_URL       = window.API_URL;
const JSON_FILE_URL = window.JSON_FILE_URL;

/* ====== 工具 ====== */
/* === 中文显示与真实 key 推回 === */
function safeDecode(s){ try{ return decodeURIComponent(s); }catch{ return s; } }
/** 从 item/url 推回 R2 的完整中文 key（含目录） */
function keyFromItem(it){
  if (it && typeof it === 'object') {
    if (it.name) return it.name;
    if (it.key)  return it.key;
    if (it.path) return it.path;
    if (it.url){
      try{
        const p = new URL(it.url).pathname;
        return safeDecode(p.replace(/^\/+/,""));
      }catch{
        const noQ = (String(it.url).split("?")[0] || "");
        return safeDecode(noQ.replace(/^https?:\/\/[^/]+\/+/,""));
      }
    }
  }
  return "";
}


/* === Feedback utils (haptic / audio / ring) === */
async function tryHaptic(ms=10){
  try{ if(navigator.vibrate){ navigator.vibrate(ms); return true; } }catch{}
  return false;
}
async function tinyClickAudio(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='square'; o.frequency.setValueAtTime(800, ctx.currentTime);
    g.gain.setValueAtTime(0.02, ctx.currentTime);
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, 40);
    return true;
  }catch{} return false;
}
function ringBlip(el){
  try{
    el.classList.remove('ring-blip'); void el.offsetWidth; el.classList.add('ring-blip');
    setTimeout(()=>el.classList.remove('ring-blip'), 140);
  }catch{}
}


function ensureCopyDot(){
  try{
    const btn = document.getElementById('copyJsonLinkBtn');
    if(!btn) return;
    if(!btn.querySelector('.copy-dot')){
      const dot = document.createElement('span');
      dot.className = 'copy-dot';
      btn.appendChild(dot);
    }
    // aria live region (offscreen) for screen reader subtle hint
    if(!document.getElementById('sr-copy-live')){
      const sr = document.createElement('div');
      sr.id = 'sr-copy-live';
      sr.setAttribute('aria-live','polite');
      sr.className = 'sr-only-live';
      document.body.appendChild(sr);
    }
  }catch{}
}
document.addEventListener('DOMContentLoaded', ensureCopyDot);

async function copyTextSmart(text){
  // 1) Modern API
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch(e){}
  // 2) execCommand 兼容方案（iOS/Safari 常用）
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly','');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch(e){}
  return false;
}


/* === Non-blocking copy overlay (auto-copy on open) === */
function showCopyOverlay(text){
  try{
    const mask = document.createElement('div');
    mask.className = 'copy-mask';
    mask.innerHTML = `
      <div class="copy-card" role="dialog" aria-label="复制 JSON 链接">
        <div class="copy-title">复制 JSON 链接</div>
        <input class="copy-input" type="text" readonly />
        <div class="copy-actions">
          <button class="copy-do">复制</button>
          <button class="copy-close">关闭</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const input = mask.querySelector('.copy-input');
    const doBtn = mask.querySelector('.copy-do');
    const closeBtn = mask.querySelector('.copy-close');
    input.value = text;
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    const close = () => { 
      mask.classList.remove('on'); 
      setTimeout(()=>mask.remove(), 150); 
      try{document.removeEventListener('keydown', onKey);}catch{}
    };
    const onKey = (e)=>{ if(e.key==='Escape') close(); if(e.key==='Enter') doBtn.click(); };
    document.addEventListener('keydown', onKey);
    mask.addEventListener('click', (e)=>{ if(e.target===mask) close(); });
    closeBtn.addEventListener('click', close);
    doBtn.addEventListener('click', async ()=>{
      const ok = await copyTextSmart(text);
      if(ok){ showToast('已复制'); close(); }
      else { try{ input.select(); document.execCommand('copy'); showToast('已复制'); close(); } catch{} }
    });
    requestAnimationFrame(async ()=>{
      mask.classList.add('on');
      // auto-copy once on open
      const ok = await copyTextSmart(text);
      if(ok){ showToast('已复制'); setTimeout(close, 250); }
      else {
        // fallback: keep overlay (user can tap 复制)
        try{ input.select(); }catch{}
      }
    });
  }catch(e){ console.warn('overlay failed', e); }
}
function showToast(t){try{const d=document.createElement('div');d.className='mini-toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.classList.add('on'),10);setTimeout(()=>{d.classList.remove('on');setTimeout(()=>d.remove(),250);},1400);}catch{}}

function showToast(t){try{const d=document.createElement('div');d.className='mini-toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.classList.add('on'),10);setTimeout(()=>{d.classList.remove('on');setTimeout(()=>d.remove(),250);},1400);}catch{}}

async function refreshIconsJson() {
  // 1) 如果页面里已经有现成的刷新函数（例如上传后会调用），直接用
  if (typeof window.updateIconsJson === "function") {
    try { await window.updateIconsJson(); return true; } catch (e) {}
  }
  // 2) 如果存在 Worker API，可约定一个刷新动作（需要你在 Worker 端支持）
  try {
    if (window.UPLOAD_API) {
      const fd = new FormData();
      fd.append("action", "refresh-icons");    // 你可以在 Worker 里用这个动作重建 icons.json（递归列举所有前缀）
      const r = await fetch(window.UPLOAD_API, { method: "POST", body: fd, cache: "no-store" });
      if (r.ok) return true;
    }
  } catch (e) {}
  // 3) 最保守兜底：强制刷新当前 icons.json 的边缘缓存（不重建内容，只确保复制的链接能拿到最新）
  try {
    const u = new URL(window.JSON_FILE_URL, location.href);
    u.searchParams.set("_", Date.now().toString());
    await fetch(u.toString(), { cache: "reload" });
    return true;
  } catch (e) {}
  return false;
}

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const getExt   = n => (n||"").match(/\.[^.]+$/)?.[0] || "";
const stripExt = n => (n||"").replace(/\.[^.]+$/, "");
const hasExt   = n => { const t=(n||"").trim(),i=t.lastIndexOf("."); return i>0 && i<t.length-1 && /^[a-z0-9]{1,5}$/i.test(t.slice(i+1)); };
const ensureDir = d => d ? (d.endsWith("/") ? d : d + "/") : "";

/* —— 定位“派生后缀”输入：兼容多DOM结构 —— */
function getSuffixInput(){
  // 1) 直接 id
  let el = document.getElementById('optSuffix');
  if (el) return el;
  // 2) 根据 label 文案（派生后缀/后缀/suffix）寻找同组 input
  const labels = Array.from(document.querySelectorAll('label, .inline, .group, .row, .field')).filter(n=>{
    const t = (n.textContent || "").trim();
    return /派生后缀|後綴|后缀|suffix/i.test(t);
  });
  for (const node of labels){
    const i = node.querySelector('input[type="text"], input:not([type]), input[type="search"]');
    if (i) return i;
  }
  // 3) 根据占位符/默认值
  const cand = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
    .find(i => /mobile|suffix|后缀|後綴/i.test(i.placeholder||"") || i.value === "-mobile");
  if (cand) return cand;
  return null;
}

/* 扩展名 ↔ MIME */
// 强制所有输出为 PNG
const EXT_2_MIME = { ".png":"image/png" };

// 用于 lookup 原始文件类型，但输出时强制用 image/png
function mimeByExt(ext){ 
  const lookup = { ".png":"image/png", ".webp":"image/webp", ".jpg":"image/jpeg", ".jpeg":"image/jpeg" };
  return lookup[(ext||"").toLowerCase()] || "image/png"; 
}

// —— 统一获取上传模式：original | square | scale —— //
function getUploadMode(){
  const r = document.querySelector('input[name="mode"]:checked')
        || document.querySelector('input[name^="mode"]:checked')
        || document.querySelector('[data-mode].is-active');
  let v = (r?.value || r?.dataset?.mode || "").toLowerCase();
  if (!v && r) {
    const label = (r.closest('label')?.innerText || r.innerText || "").trim();
    if (/原样|原圖|original|orig|raw/i.test(label)) v = "original";
    else if (/正方|square|sq/.test(label)) v = "square";
    else if (/等比|縮放|scale|fit|ratio/.test(label)) v = "scale";
  }
  if (/^original|orig|raw/.test(v)) return "original";
  if (/^square|sq/.test(v))       return "square";
  if (/^scale|fit|ratio/.test(v)) return "scale";
  return "original";
}

/* ====== 智能读取原文件（优先直链→代理→最后API） ====== */
function deriveKeyFromUrl(u){
  try { const x = new URL(u); return (x.pathname || "").replace(/^\/+/, ""); }
  catch { return (u.split("?")[0] || "").replace(/^https?:\/\/[^/]+\/+/, ""); }
}
async function fetchBlobSmart(oldKey, url){
  try { const r = await fetch(url, { cache: "no-store", mode: "cors" }); if (r.ok) return await r.blob(); } catch (_){}
  const tries = [
    u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];
  for (const build of tries){
    try { const r = await fetch(build(url), { cache: "no-store" }); if (r.ok) return await r.blob(); } catch (_){}
  }
  try {
    const apiGet = API_URL + (API_URL.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(oldKey);
    const r = await fetch(apiGet, { method: "GET" });
    if (r.ok) return await r.blob();
  } catch (_){}
  throw new Error("无法读取原文件");
}

/* ====== 选择：唯一入口 ====== */
const picked = [];
function addFiles(files){
  const seen = new Set(picked.map(f => `${f.name}|${f.size}|${f.lastModified}`));
  files.forEach(f=>{ const sig = `${f.name}|${f.size}|${f.lastModified}`; if(!seen.has(sig)) picked.push(f); });
  safeRenderPreview();
}
window.addFiles = addFiles;

/* 清空 UI */
function clearPickedUI(){
  picked.length = 0;
  const fi = $("#fileInput"); if (fi) fi.value = "";
  const box = $("#fileList"); if (box) box.innerHTML = "";
  const res = $("#result"); if (res) res.textContent = "";
}
window.clearPickedUI = clearPickedUI;

/* ====== 命名规则（全局） ====== */
function buildFinalNameForRaw(src, idx){
  const mode = $("#renameMode")?.value || "original";
  const val  = ($("#renameValue")?.value || "").trim();

  const originalExt  = getExt(src.name) || ".png";
  const originalBase = stripExt(src.name);

  if (mode === "prefix" && val) {
    const prefix = val.endsWith('/') ? val : val + '/';
    return prefix + originalBase + originalExt;
  }
  if (mode === "custom" && val) {
    if (val.includes("%i")) {
      const pat = val.replace(/%i/g, String(idx+1));
      return hasExt(pat) ? pat : (pat + originalExt);
    } else {
      if (hasExt(val)) {
        return picked.length > 1 ? `${val.replace(/\.[^.]*$/, '')}-${idx+1}${getExt(val)}` : val;
      } else {
        return (picked.length > 1 ? `${val}-${idx+1}` : val) + originalExt;
      }
    }
  }
  return originalBase + originalExt;
}

/* ====== 图像处理 ====== */
function drawRoundedRect(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, Math.min(w,h)/2));
  ctx.beginPath(); ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr); ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);     ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function colorDiff(a,b){ const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2],da=a[3]-b[3]; return Math.hypot(dr,dg,db,da); }
function avgRowColor(data,w,h,y){ let r=0,g=0,b=0,a=0; for(let x=0;x<w;x++){const i=(y*w+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];a+=data[i+3];} const n=w; return [r/n|0,g/n|0,b/n|0,a/n|0]; }
function avgColColor(data,w,h,x){ let r=0,g=0,b=0,a=0; for(let y=0;y<h;y++){const i=(y*w+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];a+=data[i+3];} const n=h; return [r/n|0,g/n|0,b/n|0,a/n|0]; }

async function processImage(file,opt){
  const { mode="original", size=500, useCorners=false, radius=0, mime="image/png", autoTrim=false, trimTolerance=14 } = opt||{};
  
  // 只有在 mode="original" 且没有勾选圆角时，才直接返回原始文件。
  if (mode === "original" && !useCorners) {
    const buf = await file.arrayBuffer();
    const ext = getExt(file.name) || ".png";
    return new Blob([buf], { type: mimeByExt(ext) });
  }

  const url = URL.createObjectURL(file);
  const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
  const srcW=img.width, srcH=img.height;

  const srcC=document.createElement('canvas'); srcC.width=srcW; srcC.height=srcH;
  const sctx=srcC.getContext('2d'); sctx.clearRect(0,0,srcW,srcH); sctx.drawImage(img,0,0);
  let sx=0, sy=0, sw=srcW, sh=srcH;

  if (autoTrim){
    const { data } = sctx.getImageData(0,0,srcW,srcH);
    let top=0,bottom=srcH-1,left=0,right=srcW-1;
    let topBase=avgRowColor(data,srcW,srcH,top); let bottomBase=avgRowColor(data,srcW,srcH,bottom);
    const rowUniform=(yy,base)=>{ const off=yy*srcW*4; for(let x=0;x<srcW;x++){const i=off+x*4; if(colorDiff([data[i],data[i+1],data[i+2],data[i+3]],base)>trimTolerance) return false;} return true; };
    while(top<bottom && rowUniform(top,topBase)){ top++; topBase=avgRowColor(data,srcW,srcH,top); }
    while(bottom>top && rowUniform(bottom,bottomBase)){ bottom--; bottomBase=avgRowColor(data,srcW,srcH,bottom); }
    let leftBase=avgColColor(data,srcW,srcH,left); let rightBase=avgColColor(data,srcW,srcH,right);
    const colUniform=(xx,base)=>{ for(let y=0;y<srcH;y++){const i=(y*srcW+xx)*4; if(colorDiff([data[i],data[i+1],data[i+2],data[i+3]],base)>trimTolerance) return false;} return true; };
    while(left<right && colUniform(left,leftBase)){ left++; leftBase=avgColColor(data,srcW,srcH,left); }
    while(right>left && colUniform(right,rightBase)){ right--; rightBase=avgColColor(data,srcW,srcH,right); }
    sx=left; sy=top; sw=right-left+1; sh=bottom-top+1;
  }

  let outW,outH;
  if (mode==="square"){ 
    outW=size; outH=size; 
  }
  else if (mode==="scale"){ 
    const ratio=Math.max(sw,sh)/size; outW=Math.round(sw/ratio); outH=Math.round(sh/ratio); 
  }
  else { 
    // mode 为 "original"：保持原始尺寸
    outW=sw; outH=sh; 
  }

  const canvas=document.createElement('canvas'); canvas.width=outW; canvas.height=outH;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,outW,outH);
  if (useCorners && radius>0){ const r=Math.min(radius,Math.floor(Math.min(outW,outH)/2)); drawRoundedRect(ctx,0,0,outW,outH,r); ctx.clip(); }
  ctx.drawImage(srcC,sx,sy,sw,sh,0,0,outW,outH);
  // 这里 mime 已经是 "image/png"
  const blob=await new Promise(res=>canvas.toBlob(res,mime,0.92)); 
  URL.revokeObjectURL(url);
  return blob;
}

/* ====== 预览 ====== */
async function renderPreview(){
  const box = $("#fileList"); if(!box) return; box.innerHTML = "";
  const mode = getUploadMode();
  const size=Number($("#optSize")?.value||500);
  const useCorners=$("#optAdjustCorners")?.checked||false;
  const radius=Math.max(0,Number($("#cornerRadius")?.value||0));

  for (let idx=0; idx<picked.length; idx++){
    const file=picked[idx];
    const srcExt=(getExt(file.name)||"").toLowerCase();
    
    // 预览强制使用 PNG 以显示透明度和圆角
    const previewMime="image/png"; 

    let thumb;
    try{
      // 预览时使用 mode，但尺寸限制为 360
      thumb = await processImage(file,{mode,size:Math.min(360,size),useCorners,radius,mime:previewMime,autoTrim:false,trimTolerance:14});
    }catch(_){
      const buf=await file.arrayBuffer(); thumb=new Blob([buf],{type:file.type||"application/octet-stream"});
    }

    const url=URL.createObjectURL(thumb);
    const div=document.createElement("div");
    div.className="file-item";
    div.innerHTML=`<img loading="lazy" alt="${file.name}" src="${url}">`;
    box.appendChild(div);
  }
}
function safeRenderPreview(){ try{ return renderPreview(); }catch(e){ console.error('renderPreview error:',e); } }

/* ====== 上传到 API ====== */
async function uploadToAPI(file, key, overwrite=true){
  const fd=new FormData();
  fd.append("file", new File([file], key, { type: file.type || "application/octet-stream" }));
  fd.append("key", key);
  fd.append("overwrite", String(overwrite));
  const url = API_URL + (API_URL.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key);
  const r=await fetch(url, { method:"POST", body:fd });
  const json=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(json.error || `Upload failed ${r.status}`);
  return json;
}
window.uploadToAPI = uploadToAPI;

/* ====== 上传：自动处理 + 上传 ====== */
async function uploadFiles(){
  if(!picked.length){ alert("请先选择或拖入文件"); return; }
  const mode = getUploadMode();
  const size=Number($("#optSize")?.value||500);
  const useCorners=$("#optAdjustCorners")?.checked||false;
  const radius=Math.max(0,Number($("#cornerRadius")?.value||0));
  const suffixField = getSuffixInput();
  const suffix = (suffixField ? suffixField.value : (window.DEFAULT_SUFFIX || "")).trim(); // 注意：这里将 DEFAULT_SUFFIX 默认为空

  const alsoOriginal=$("#optAlsoOriginal")?.checked||false;
  const overwrite=($("#optOverwrite")?.checked??true)&&($("#overwrite")?.checked??true);
  const dir=($("#optDir")?.value||"TV_logo").trim();

  $("#result").textContent="⏳ 正在处理并上传…";
  const jobs=[];

  for (let i=0;i<picked.length;i++){
    const src=picked[i];
    const rawName=buildFinalNameForRaw(src,i);
    
    // --- 1. 确定处理需求和命名 ---
    const wantAlpha = (useCorners && radius>0); 

    // 只有在非 original 模式，或 original 模式但勾选了圆角时，才需要执行 processImage
    const needProcess = (mode !== "original") || wantAlpha;
    
    // 派生后缀（-mobile等）只在非 "original" 模式下生效
    const shouldDeriveName = (mode !== "original"); 

    // 强制输出 PNG
    const outExt=".png";
    const outMime="image/png";
    
    const baseNoExt=stripExt(rawName);

    // 目标文件名：根据是否需要派生命名来决定是否应用后缀
    const withSuffix = shouldDeriveName ? (baseNoExt+(suffix||"")) : baseNoExt;
    
    // 在这里应用强制的 .png 扩展名
    const targetKey  = ensureDir(dir)+withSuffix+outExt; 
    
    // 原始文件名/路径 (用于 alsoOriginal)
    const rawKey = ensureDir(dir)+rawName;

    const sampleName = targetKey; // 总是以目标文件名作为示例
    if (i===0) $("#result").textContent=`📄 示例：${sampleName}（其余同规则）`;

    // --- 2. 执行上传任务 ---
    if (!needProcess){
      // 严格原样（mode="original" 且无圆角）：直接上传原文件，但使用 .png 命名
      // 注意：这里是直接上传原始文件，文件内容格式不变，只是文件名被强制改为 .png
      jobs.push(uploadToAPI(new File([src],targetKey,{type:src.type,lastModified:src.lastModified}),targetKey,overwrite));
      // 这里的 alsoOriginal 和 targetKey 相同，无需重复上传
    } else {
      // 无论是正方形/缩放模式，还是带圆角的原样模式：都执行 processImage (强制转为 PNG 内容)
      const processedBlob=await processImage(src,{mode,size,useCorners,radius,mime:outMime,autoTrim:false,trimTolerance:14});
      jobs.push(uploadToAPI(new File([processedBlob],targetKey,{type:outMime}),targetKey,overwrite));
      
      // 上传原图副本（如果勾选了 alsoOriginal 且目标文件名不同）
      if (alsoOriginal && targetKey !== rawKey){
        // 上传原始文件副本，保留其原始扩展名和类型，只在目标路径不同时上传
        jobs.push(uploadToAPI(new File([src], rawKey, {type:src.type,lastModified:src.lastModified}), rawKey, overwrite));
      }
    }
  }

  try{
    await Promise.all(jobs);
    $("#result").textContent=`✅ 完成：${jobs.length} 个文件（含派生/原图）`;
    clearPickedUI();
    setTimeout(()=>{ loadExisting().catch(()=>{}); },800);
  }catch(err){
    alert("处理或上传失败："+(err?.message||err));
  }
}
$("#uploadBtn")?.addEventListener("click", uploadFiles);

/* ====== 已有清单/渲染/删除/复制/重命名 ====== */
async function fetchJsonWithFallback(url){
  try{ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return await r.json(); }catch(_){}
  try{ const u=`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`; const r=await fetch(u,{cache:"no-store"}); if(!r.ok) throw new Error(); const j=await r.json(); return JSON.parse(j.contents); }catch(_){}
  const u2=`https://corsproxy.io/?${encodeURIComponent(url)}`; const r2=await fetch(u2,{cache:"no-store"}); if(!r2.ok) throw new Error("All fallbacks failed"); const txt=await r2.text();
  try{ return JSON.parse(txt); } catch{ return JSON.parse((await r2.json()).contents); }
}

/* ====== 单实例保护 & 紧急关闭 ====== */
window.forceCloseModals = function(){
  document.querySelectorAll('.glass-rename-wrap,.glass-del-wrap').forEach(n=>n.remove());
};
function ensureSingleModal(selector){
  const exist = document.querySelector(selector);
  if (exist) exist.remove();
}

/* —— 玻璃风格重命名弹窗 —— */
function showGlassRenameModal({oldKey, displayName}){
  return new Promise(resolve=>{
    ensureSingleModal('.glass-rename-wrap');

    const oldTail = oldKey.split("/").pop() || displayName || "";
    const oldDir  = oldKey.slice(0, Math.max(0, oldKey.lastIndexOf("/")+1));

    const wrap = document.createElement("div");
    wrap.className = "glass-rename-wrap";
    wrap.innerHTML = `
      <div class="glass-rename-mask"></div>
      <div class="glass-rename-modal" role="dialog" aria-modal="true">
        <div class="grm-header">
          <span>重命名</span>
          <button class="grm-close" aria-label="关闭">✕</button>
        </div>
        <div class="grm-body">
          <div class="grm-row"><label>当前：</label><span class="grm-current">${oldTail}</span></div>
          <div class="grm-input">
            <input class="grm-text" value="${oldDir + oldTail}" spellcheck="false" />
            <button class="grm-keepdir" title="使用原目录">📂</button>
          </div>
          <div class="grm-tip">未填写扩展名会自动沿用；可改目录/文件名。</div>
          <div class="grm-warning" style="display:none;"></div>
        </div>
        <div class="grm-actions">
          <button class="grm-btn grm-cancel">取消</button>
          <button class="grm-btn grm-ok">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    // draggable（指针捕获健壮化）
    (function makeDraggable(){
      const modal = wrap.querySelector(".glass-rename-modal");
      const header = wrap.querySelector(".grm-header");
      let sx=0, sy=0, mx=0, my=0, dragging=false, pid=null;

      header.addEventListener("pointerdown", e=>{
        dragging=true; sx=e.clientX; sy=e.clientY;
        const rect=modal.getBoundingClientRect(); mx=rect.left; my=rect.top;
        pid = e.pointerId; try{ header.setPointerCapture(pid); }catch(_){}
      });
      const end = ()=>{
        if(!dragging) return;
        dragging=false;
        try{ pid!=null && header.releasePointerCapture(pid); }catch(_){}
        pid=null;
      };
      header.addEventListener("pointermove", e=>{
        if(!dragging) return;
        const dx=e.clientX-sx, dy=e.clientY-sy;
        modal.style.transform=`translate(${mx+dx}px, ${my+dy}px)`;
        modal.style.left="0"; modal.style.top="0";
      });
      header.addEventListener("pointerup", end);
      header.addEventListener("pointercancel", end);
      window.addEventListener("blur", end);
    })();

    const input = wrap.querySelector(".grm-text");
    setTimeout(()=>{ input.focus(); input.select(); }, 10);

    const warn = wrap.querySelector(".grm-warning");
    wrap.querySelector(".grm-keepdir").onclick = ()=>{ 
      const v = input.value.trim();
      const tail = v.split("/").pop() || oldTail;
      input.value = oldDir + tail;
      input.focus(); input.select();
    };

    function close(ret){ wrap.remove(); resolve(ret); }
    function validate(v){ if (/^\/.*/.test(v)) return "路径请不要以 / 开头"; return ""; }

    function onOK(){
      let v = input.value.trim().replace(/^\/+/, "");
      if (!v) return close(null);
      if (!hasExt(v)) v += (getExt(oldTail) || ".png");
      const err = validate(v);
      if (err) { warn.textContent = err; warn.style.display = "block"; return; }
      close(v);
    }

    wrap.querySelector(".grm-ok").onclick = onOK;
    wrap.querySelector(".grm-cancel").onclick = ()=>close(null);
    wrap.querySelector(".grm-close").onclick  = ()=>close(null);
    wrap.querySelector(".glass-rename-mask").onclick = ()=>close(null);
    input.addEventListener("keydown", e=>{
      if (e.key === "Enter") onOK();
      if (e.key === "Escape") close(null);
    });
  });
}

/* —— 玻璃风格删除确认 —— */
function showGlassDeleteModal({fileKey, displayName}){
  return new Promise(resolve=>{
    ensureSingleModal('.glass-del-wrap');

    const wrap = document.createElement("div");
    wrap.className = "glass-del-wrap";
    wrap.innerHTML = `
      <div class="glass-del-mask"></div>
      <div class="glass-del-modal" role="dialog" aria-modal="true">
        <div class="gdm-header">确认删除</div>
        <div class="gdm-body">
          <p>确定要删除 <span class="gdm-file">${displayName||fileKey}</span> 吗？</p>
          <p class="gdm-warn">此操作不可撤销！</p>
        </div>
        <div class="gdm-actions">
          <button class="gdm-btn gdm-cancel">取消</button>
          <button class="gdm-btn gdm-ok">删除</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    function close(val){ wrap.remove(); resolve(val); }
    wrap.querySelector(".gdm-cancel").onclick = ()=>close(false);
    wrap.querySelector(".gdm-ok").onclick     = ()=>close(true);
    wrap.querySelector(".glass-del-mask").onclick = ()=>close(false);
    window.addEventListener("keydown", (e)=>{ if(e.key==="Escape") close(false); }, {once:true});
  });
}

/* —— 重命名（复制新 key -> 删除旧 key）—— */
async function renameFile(oldKey, url, displayName){
  if (!oldKey || !oldKey.includes("/")) { const guess=deriveKeyFromUrl(url); if (guess) oldKey=guess; }
  const newKey = await showGlassRenameModal({ oldKey, displayName });
  if (!newKey) return;

  const overwrite = ($("#optOverwrite")?.checked ?? true) && ($("#overwrite")?.checked ?? true);
  const msg = $("#result"); const prevMsg = msg?.textContent; if (msg) msg.textContent = "✏️ 正在重命名…";

  try{
    const blob = await fetchBlobSmart(oldKey, url);
    await uploadToAPI(new File([blob], newKey, { type: blob.type || "application/octet-stream" }), newKey, overwrite);
    await deleteFile(oldKey, null, displayName);
    await loadExisting();
    if (msg) msg.textContent = `✅ 重命名完成：${oldKey} → ${newKey}`;
  }catch(e){
    alert("重命名失败：" + e.message);
    if (msg) msg.textContent = prevMsg || "";
  }
}

/* —— 删除 —— */
async function deleteFile(fileKey, btn, displayName){
  if (fileKey && !fileKey.includes("/") && btn) {
    try {
      const card = btn.closest(".ex-item");
      const url  = card?.querySelector(".copy-url")?.dataset.url;
      if (url) {
        try { fileKey = (new URL(url).pathname || "").replace(/^\/+/, ""); }
        catch { fileKey = (url.split("?")[0] || "").replace(/^https?:\/\/[^/]+\/+/, ""); }
      }
    } catch {}
  }
  if (!fileKey) { alert("删除失败：无效的文件 key"); return; }

  const ok = await showGlassDeleteModal({ fileKey, displayName });
  if (!ok) return;

  const orig = btn?.textContent;
  if(btn){ btn.disabled=true; btn.textContent="Deleting..."; }
  try{
    const url = API_URL + (API_URL.includes("?")?"&":"?") + "key=" + encodeURIComponent(fileKey);
    const response = await fetch(url, { method: "DELETE", headers:{ "Accept":"application/json" }});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "File not found");
    await loadExisting();
  }catch(e){
    alert("删除失败：" + e.message);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=orig||"🗑️"; }
  }
}
window.deleteFile = deleteFile;

/* ====== 列表渲染（底部透明图标按钮：📋 ✏️ 🗑️） ====== */
let exAll = [], exFiltered = [];
function renderList(list){
  const box = $("#existingList"); if(!box) return; box.innerHTML="";
  const frag=document.createDocumentFragment();

  list.forEach(it=>{
    const name = it.name || it.file || it.key || "";
    const url  = it.url  || it.href || "";
    const key  = keyFromItem({ name, key: it.key, path: it.path, url });

    const div=document.createElement("div");
    div.className="ex-item";

    div.innerHTML=`
      <div class="ex-image-area">
        <img loading="lazy" alt="${name}" src="${url}">
      </div>
      <div class="ex-name" title="${it.path || name}">${name}</div>
      <div class="ex-actions circle-actions">
        <button class="copy-url"     data-url="${url}"  aria-label="Copy"></button>
        <button class="rename-file"  data-key="${key}" data-url="${url}" data-name="${name}" aria-label="Rename"></button>
        <button class="delete-file"  data-key="${key}" data-name="${name}" aria-label="Delete"></button>
      </div>`;

    // Copy
    div.querySelector(".copy-url").onclick = (e)=> {
      const u = e.currentTarget.dataset.url;
      navigator.clipboard.writeText(u)
        .then(()=>{
          const b=e.currentTarget;
          b.textContent="已复制";
          b.style.fontSize="12px";
          setTimeout(()=>{ b.textContent=""; b.style.fontSize="0"; }, 850);
        })
        .catch(()=>prompt("Copy:",u));
    };

    // Rename
    div.querySelector(".rename-file").onclick = (e)=> {
      const btn=e.currentTarget;
      renameFile(btn.dataset.key, btn.dataset.url, btn.dataset.name);
    };

    // Delete
    div.querySelector(".delete-file").onclick = (e)=> {
      const btn=e.currentTarget;
      deleteFile(btn.dataset.key, btn, btn.dataset.name);
    };

    frag.appendChild(div);
  });

  box.appendChild(frag);
}

function applyFilter(){
  const q = ($("#exSearch").value || "").toLowerCase().trim();
  const p = ($("#exPrefix")?.value || "").trim();

  exFiltered = exAll.filter(it=>{
    const name = it.name || "";
    const path = it.path || it.key || name;
    const okQ = q ? name.toLowerCase().includes(q) : true;
    const okP = p ? (path || "").startsWith(p) : true;
    return okQ && okP;
  });
  renderList(exFiltered);
}

async function loadExisting(){
  const data = await fetchJsonWithFallback(JSON_FILE_URL);
  const list = Array.isArray(data) ? data : (data.files || data.icons || data.list || []);

  exAll = list.map(it => {
    const url = it.url || it.href || "";
    let path = "";
    try { const u = new URL(url); path = (u.pathname || "").replace(/^\/+/, ""); }
    catch { const noQ = (url.split("?")[0] || ""); path = noQ.replace(/^https?:\/\/[^/]+\/+/, ""); }

    let name = it.name || it.file || it.key || "";
    if (!name && path) name = path.split("/").pop() || "";

    if ((!name || !name.includes("-mobile")) && url) {
      const tail = decodeURIComponent((url.split("?")[0] || "").split("/").pop() || "");
      if (tail) name = tail;
    }
    const key = it.key || path;
    return { name, url, path, key };
  });

  applyFilter();
}
$("#refreshExisting")?.addEventListener("click", ()=>loadExisting().catch(e=>alert(e.message)));
$("#exClear")?.addEventListener("click", ()=>{ $("#exSearch").value=""; $("#exPrefix").value=""; applyFilter(); });
$("#exSearch")?.addEventListener("input", applyFilter);
$("#exPrefix")?.addEventListener("input", applyFilter);
document.addEventListener("DOMContentLoaded", ()=>{ 
  loadExisting().catch(e=>alert("读取失败："+e.message)); 
  // 若后缀输入为空，不再给默认值 -mobile
  // const suffixInput = getSuffixInput();
  // if (suffixInput && !suffixInput.value) suffixInput.value = "-mobile"; 
  syncOptionLock();
});

// —— 允许圆角和半径在“原样”模式下启用 ——
function syncOptionLock(){
  const mode = getUploadMode();
  const lockSize = (mode === "original"); // 只有尺寸在原样模式下禁用

  const sizeEl   = $("#optSize");
  const cornerEl = $("#optAdjustCorners");
  const radiusEl = $("#cornerRadius");
  const suffixEl = getSuffixInput();

  // 1. 尺寸(px) 禁用/启用
  if (sizeEl) {
    sizeEl.disabled = lockSize;
    sizeEl.closest(".inline")?.classList.toggle("is-disabled", lockSize);
  }

  // 2. 圆角和半径：不再被 mode="original" 禁用
  if (cornerEl) cornerEl.disabled = false;
  if (radiusEl) {
    // radiusEl 仅在 cornerEl 未选中时禁用
    radiusEl.disabled = !cornerEl.checked;
    radiusEl.closest(".inline")?.classList.toggle("is-disabled", radiusEl.disabled);
  }

  // 3. 后缀：仅原样模式显示灰色视觉，不禁用
  if (suffixEl) suffixEl.classList.toggle('suffix-muted', lockSize);
}

// 监听模式切换，动态锁定控件 + 触发预览
(function bindModeSwitchWatchers(){
  const rebind = sel => document.querySelectorAll(sel)
    .forEach(el => ["input","change"].forEach(ev => el.addEventListener(ev, () => {
      clearTimeout(window.__reprev_t);
      window.__reprev_t = setTimeout(safeRenderPreview, 120);
      syncOptionLock();
    })));

  // 预览相关控件 
  rebind('#optSize, #optAdjustCorners, #cornerRadius');

  // 常规单选/按钮切换模式
  document.addEventListener("change", (e)=>{
    if (e.target.matches('input[name="mode"], input[name^="mode"], [data-mode], #optAdjustCorners')) { 
      syncOptionLock();
    }
  });
  document.addEventListener("click", (e)=>{
    if (e.target.closest('[data-mode]')) syncOptionLock();
  });
})();

// —— 选择文件：稳健绑定（id / data-action / 旧选择器都支持） —— //
(function bindBrowseButton(){
  const input = document.getElementById('fileInput')
             || document.querySelector('input[type="file"][id*="file"]');
  if (!input) return;

  const triggers = [
    document.getElementById('browseBtn'),
    document.querySelector('[data-action="browse"]'),
    document.querySelector('.btn-browse'),
    document.querySelector('button[name="browse"]')
  ].filter(Boolean);

  const openPicker = () => {
    if (typeof window.forceCloseModals === 'function') window.forceCloseModals();
    try{ if (input.showPicker) { input.showPicker(); return; } }catch(_){}
    input.disabled = false;
    try{ input.focus({ preventScroll: true }); }catch(_){}
    input.click();
  };

  triggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPicker();
    }, { passive: true });
  });

  // 拖拽兜底
  ['dragover','drop'].forEach(ev=>{
    document.addEventListener(ev, e => {
      e.preventDefault();
      if (ev === 'drop' && e.dataTransfer?.files?.length) {
        addFiles([...e.dataTransfer.files]);
      }
    });
  });

  // 文件变更 → 加入列表
  input.addEventListener('change', e => {
    if (e.target.files && e.target.files.length) addFiles([...e.target.files]);
    setTimeout(()=>{ try{ e.target.value = ''; }catch(_){ } }, 0);
  });
})();

/* ====== 注入样式（提高灰样式权重 + !important，并包含按钮/弹窗样式） ====== */











/* === JSON link copy (force: refresh first, then copy; show text feedback) === */
document.getElementById("copyJsonLinkBtn")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const old = btn.textContent;
  try {
    // 禁重复点击（避免多次触发），但不改变外观
    btn.style.pointerEvents = 'none';
    // 先刷新（Worker 端需支持 action=refresh-icons）
    try { await refreshIconsJson(); } catch {}
    // 再复制（带时间戳，确保无缓存）
    const u = new URL(window.JSON_FILE_URL, location.href);
    u.searchParams.set("_", Date.now().toString());
    const urlStr = u.toString();
    const ok = await copyTextSmart(urlStr);
    if (!ok) {
      // 复制 API 不可用，显示非阻塞浮层兜底
      showCopyOverlay(urlStr);
    } else {
      // 成功 → 文本短暂显示“已复制”
      btn.textContent = "已复制";
      setTimeout(()=>{ btn.textContent = old; }, 850);
    }
  } finally {
    btn.style.pointerEvents = '';
  }
});