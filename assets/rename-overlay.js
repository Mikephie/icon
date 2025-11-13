/*! Corner tools (left 🔗 / right ✏️) — pinned & truly transparent */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const getExt = n => (n || "").match(/\.[^.]+$/)?.[0] || "";
  const hasExt = n => {
    const t = (n || "").trim(); const i = t.lastIndexOf(".");
    return i > 0 && i < t.length - 1 && /^[a-z0-9]{1,5}$/i.test(t.slice(i + 1));
  };

  async function fetchOriginalBlob(url) {
    const tryFetch = (u) => fetch(u, { cache: "no-store" });
    let r = await tryFetch(url).catch(()=>null);
    if (!r || !r.ok) r = await tryFetch("https://corsproxy.io/?" + encodeURIComponent(url)).catch(()=>null);
    if (!r || !r.ok) throw new Error("拉取原图失败");
    return await r.blob();
  }

  async function uploadBlobSmart(blob, key, overwrite = true) {
    if (typeof window.uploadBlobToR2 === 'function') {
      return await window.uploadBlobToR2(blob, key, overwrite);
    }
    const endpoint = window.API_URL;
    if (!endpoint) throw new Error("No API_URL");
    const fd = new FormData();
    const file = new File([blob], key, { type: blob.type || "application/octet-stream" });
    fd.append("file", file);
    fd.append("key", key);
    fd.append("overwrite", overwrite ? "true" : "false");
    const r = await fetch(endpoint, { method: "POST", body: fd });
    if (!r.ok) throw new Error("Upload failed " + r.status);
    return r.json();
  }

  async function renameFileFromUrl(oldName, url, newNameRaw) {
    const lastSlash = oldName.lastIndexOf("/");
    const baseDir = lastSlash >= 0 ? oldName.slice(0, lastSlash + 1) : "";
    const oldExt = getExt(oldName);

    let newName = (newNameRaw || "").trim();
    if (!newName) throw new Error("空文件名");
    if (!hasExt(newName)) newName += oldExt;
    if (!newName.includes("/") && baseDir) newName = baseDir + newName;

    const blob = await fetchOriginalBlob(url);
    await uploadBlobSmart(blob, newName, true);

    const del = confirm(`已保存为：\n${newName}\n\n是否删除旧文件？\n${oldName}`);
    if (del && typeof window.deleteFile === 'function') {
      await window.deleteFile(oldName, { textContent: "Del", style: {}, disabled: false });
    }
    if (typeof window.loadExisting === 'function') {
      try { await window.loadExisting(); } catch (_) { }
    }
    return newName;
  }

  // 强制透明样式，避免被主题染色 [oai_citation:9‡rename-overlay.js](file-service://file-UwJQUuggKhyfKZXiX9D41z) [oai_citation:10‡app.css](file-service://file-Y2dh9NgGYK57xqahABLvWc)
  function injectGhostCSS() {
    if (document.getElementById('corner-ghost-style')) return;
    }

  function applyGhost(el) {
    const set = (k, v) => el.style.setProperty(k, v, 'important');
    set('position','absolute');
    set('top','4px');
    set('width','24px'); set('height','24px');
    set('display','grid'); set('place-items','center');
    set('border-radius','8px');
    set('background','transparent'); set('border','none');
    set('color','inherit'); set('text-decoration','none');
    set('font-size','16px'); set('line-height','1');
    set('cursor','pointer'); set('text-shadow','none'); set('box-shadow','none');
    set('-webkit-appearance','none'); set('appearance','none');
    set('padding','0'); set('z-index','30');
  }
  const pinLeft  = el => { el.style.removeProperty('right'); el.style.setProperty('left','4px','important'); };
  const pinRight = el => { el.style.removeProperty('left');  el.style.setProperty('right','4px','important'); };

  function addHover(el){
    el.addEventListener('mouseenter', () => {
      el.style.setProperty('background','rgba(0,255,255,.15)','important');
      el.style.setProperty('box-shadow','0 0 0 1px rgba(0,255,255,.35), 0 0 10px rgba(0,255,255,.35)','important');
    });
    el.addEventListener('mouseleave', () => {
      el.style.setProperty('background','transparent','important');
      el.style.setProperty('box-shadow','none','important');
    });
  }

  function ensureCorners(card) {
    const area = card.querySelector('.ex-image-area');
    if (!area) return;
    if (area.querySelector('.corner-link') || area.querySelector('.corner-edit')) return;

    const url = card.querySelector('.ex-actions .copy-url')?.dataset?.url || card.querySelector('img')?.src || "";
    const name = card.querySelector('.ex-actions .delete-file')?.dataset?.name
              || card.querySelector('.ex-name')?.textContent || "";
    if (!url || !name) return;

    const linkBtn = document.createElement('a');
    linkBtn.className = 'corner-btn corner-link';
    linkBtn.href = url;
    linkBtn.target = '_blank';
    linkBtn.rel = 'noopener';
    linkBtn.title = '打开直链';
    linkBtn.textContent = '🔗';
    applyGhost(linkBtn); pinLeft(linkBtn); addHover(linkBtn);

    const editBtn = document.createElement('a');
    editBtn.className = 'corner-btn corner-edit';
    editBtn.href = 'javascript:void(0)';
    editBtn.role = 'button'; editBtn.tabIndex = 0;
    editBtn.title = '重命名';
    editBtn.textContent = '✏️';
    applyGhost(editBtn); pinRight(editBtn); addHover(editBtn);

    const handleRename = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const input = card.querySelector('.rename-input') || card.querySelector('input[type="text"]');
      if (input) { input.focus(); input.select(); return; }

      const suggested = (name || "").split('/').pop();
      const typed = prompt('输入新文件名（可含目录）', suggested);
      const newRaw = (typed || '').trim(); if (!newRaw) return;

      editBtn.setAttribute('aria-busy','true'); editBtn.textContent = '…';
      try {
        await renameFileFromUrl(name, url, newRaw);
        editBtn.textContent = '✅';
      } catch (err) {
        alert('重命名失败：' + (err?.message || err));
        editBtn.textContent = '✏️';
      } finally {
        editBtn.removeAttribute('aria-busy');
        setTimeout(() => { editBtn.textContent = '✏️'; }, 600);
      }
    };
    editBtn.addEventListener('click', handleRename);
    editBtn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') handleRename(ev);
    });

    area.appendChild(linkBtn);
    area.appendChild(editBtn);
  }

  function scan() { $$('.ex-item').forEach(ensureCorners); }

  function observeCornerStyle() {
    const root = document.body;
    const reapply = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches && (node.matches('.corner-btn') || node.querySelector?.('.corner-btn'))) {
        node.querySelectorAll?.('.corner-btn').forEach(applyGhost);
        if (node.matches('.corner-btn')) applyGhost(node);
      }
    };
    new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(reapply);
        if (m.target && (m.attributeName === 'class' || m.attributeName === 'style')) reapply(m.target);
      });
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] });
  }

  window.addEventListener('DOMContentLoaded', () => {
    injectGhostCSS();
    scan();
    observeCornerStyle();

    if (typeof window.loadExisting === 'function') {
      const orig = window.loadExisting;
      window.loadExisting = async function (...args) {
        const r = await orig.apply(this, args);
        try { scan(); } catch (_) { }
        return r;
      };
    }
  });
})();