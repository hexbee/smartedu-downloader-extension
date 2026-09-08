// content.js - SmartEdu PDF Downloader (Manifest V3 - Main World & All Frames)

(() => {
  // ==========================================
  // 场景 1：如果当前处于 iframe 内（即 PDF 阅读器窗口）
  // ==========================================
  if (window !== window.top) {
    // 监听来自顶层页面的下载指令
    window.addEventListener('message', async (event) => {
      if (event.data && event.data.type === 'SMARTEDU_TRIGGER_PDF_DOWNLOAD') {
        try {
          const app = window.PDFViewerApplication;
          if (!app) {
            window.parent.postMessage({
              type: 'SMARTEDU_PDF_DATA_RESP',
              success: false,
              error: '未找到 PDF 阅读器组件'
            }, '*');
            return;
          }

          if (!app.pdfDocument) {
            window.parent.postMessage({
              type: 'SMARTEDU_PDF_DATA_RESP',
              success: false,
              error: '课本正在加载中，请等待页面显示完整课本后再下载'
            }, '*');
            return;
          }

          // 核心：直接从内存中获取完整 PDF 的 Uint8Array
          const uint8 = await app.pdfDocument.getData();
          const buffer = uint8.buffer;

          // 通过 Transferable Object 将二进制数据 0 延迟秒传回顶层页面
          window.parent.postMessage({
            type: 'SMARTEDU_PDF_DATA_RESP',
            success: true,
            buffer: buffer
          }, '*', [buffer]);

        } catch (err) {
          window.parent.postMessage({
            type: 'SMARTEDU_PDF_DATA_RESP',
            success: false,
            error: err.message || '阅读器内存导出失败'
          }, '*');
        }
      }
    });

    // 在 iframe 内部不渲染悬浮按钮
    return;
  }

  // ==========================================
  // 场景 2：顶层页面（basic.smartedu.cn 详情页）
  // ==========================================
  let isDownloading = false;

  const ICONS = {
    download: `<svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    error: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`
  };

  function getCleanTitle() {
    let title = document.title || '教材';
    title = title.replace(/[-_]?(国家中小学智慧教育平台|智慧教育平台|中小学智慧教育平台).*$/i, '').trim();
    return title.replace(/[\\/:*?"<>|]/g, '_').trim() || '智慧教育教材';
  }

  function findPdfIframe() {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      const src = iframe.src || '';
      if (src.includes('viewer.html') || src.includes('file=') || src.includes('.pdf')) {
        return iframe;
      }
    }
    return null;
  }

  function showToast(container, message, duration = 3500) {
    const toast = container.querySelector('.smartedu-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  function saveBlob(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      a.remove();
    }, 3000);
  }

  function requestPdfFromIframe(iframe, timeoutMs = 1800) {
    return new Promise((resolve) => {
      let timer = null;
      const handler = (e) => {
        if (e.data && e.data.type === 'SMARTEDU_PDF_DATA_RESP') {
          window.removeEventListener('message', handler);
          if (timer) clearTimeout(timer);
          if (e.data.success && e.data.buffer) {
            resolve({ success: true, buffer: e.data.buffer });
          } else {
            resolve({ success: false, error: e.data.error });
          }
        }
      };

      window.addEventListener('message', handler);

      try {
        iframe.contentWindow.postMessage({ type: 'SMARTEDU_TRIGGER_PDF_DOWNLOAD' }, '*');
      } catch (err) {
        window.removeEventListener('message', handler);
        return resolve({ success: false, error: err.message });
      }

      timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, timeout: true });
      }, timeoutMs);
    });
  }

  async function startDownload(container) {
    if (isDownloading) return;

    const iframe = findPdfIframe();
    if (!iframe) {
      showToast(container, '未找到课本预览窗口，请稍等加载');
      return;
    }

    const btn = container.querySelector('.smartedu-fab-btn');
    const iconEl = container.querySelector('.smartedu-fab-icon');
    const titleEl = container.querySelector('.smartedu-fab-title');
    const subtitleEl = container.querySelector('.smartedu-fab-subtitle');

    isDownloading = true;
    btn.className = 'smartedu-fab-btn loading';
    iconEl.innerHTML = '<div class="smartedu-spinner"></div>';
    titleEl.textContent = '准备导出...';
    subtitleEl.textContent = '正在获取课本';

    const filename = `${getCleanTitle()}.pdf`;

    try {
      let downloaded = false;

      // 阶段 1：优先尝试同源 iframe 内存直接提取（秒级无损）
      try {
        const app = iframe.contentWindow?.PDFViewerApplication;
        if (app?.pdfDocument) {
          titleEl.textContent = '从内存极速导出...';
          subtitleEl.textContent = '秒级无损保存';
          const uint8 = await app.pdfDocument.getData();
          saveBlob(new Blob([uint8], { type: 'application/pdf' }), filename);
          downloaded = true;
        }
      } catch (e) {
        // 跨域受限，进入阶段 2
      }

      // 阶段 2：通过跨 frame postMessage 请求阅读器导出内存中的 Buffer
      if (!downloaded) {
        titleEl.textContent = '导出课本数据...';
        subtitleEl.textContent = '内存直传中';
        const msgRes = await requestPdfFromIframe(iframe, 1800);
        if (msgRes.success && msgRes.buffer) {
          saveBlob(new Blob([msgRes.buffer], { type: 'application/pdf' }), filename);
          downloaded = true;
        } else if (msgRes.error && !msgRes.timeout) {
          throw new Error(msgRes.error);
        }
      }

      // 阶段 3：如果内存未就绪且 URL 包含有效鉴权头，尝试网络直链下载
      if (!downloaded) {
        titleEl.textContent = '网络下载中...';
        subtitleEl.textContent = '提取高清原件';

        const urlObj = new URL(iframe.src);
        const fileUrl = urlObj.searchParams.get('file');
        const headers = JSON.parse(urlObj.searchParams.get('headers') || '{}');

        // 仅在拥有 X-ND-AUTH 鉴权头时请求，避免无签名的 401 报错
        if (fileUrl && (headers['X-ND-AUTH'] || headers['x-nd-auth'])) {
          const res = await fetch(fileUrl, { headers });
          if (res.ok) {
            const blob = await res.blob();
            saveBlob(blob, filename);
            downloaded = true;
          } else {
            throw new Error(`下载失败 (HTTP ${res.status})`);
          }
        }
      }

      if (!downloaded) {
        throw new Error('课本尚未渲染完成，请等待页面显示出课本正文后再点击');
      }

      // 成功状态
      btn.className = 'smartedu-fab-btn success';
      iconEl.innerHTML = ICONS.check;
      titleEl.textContent = '下载已启动！';
      subtitleEl.textContent = '请查看浏览器下载';
      showToast(container, `已保存：${filename}`);

      setTimeout(() => {
        resetBtnState(container);
      }, 3500);

    } catch (err) {
      console.error('[SmartEdu Downloader Error]', err);
      btn.className = 'smartedu-fab-btn error';
      iconEl.innerHTML = ICONS.error;
      titleEl.textContent = '下载出错';
      subtitleEl.textContent = '点击重试';
      showToast(container, err.message || '下载发生异常');

      setTimeout(() => {
        resetBtnState(container);
      }, 4500);
    } finally {
      isDownloading = false;
    }
  }

  function resetBtnState(container) {
    if (isDownloading) return;
    const btn = container.querySelector('.smartedu-fab-btn');
    const iconEl = container.querySelector('.smartedu-fab-icon');
    const titleEl = container.querySelector('.smartedu-fab-title');
    const subtitleEl = container.querySelector('.smartedu-fab-subtitle');

    btn.className = 'smartedu-fab-btn';
    iconEl.innerHTML = ICONS.download;
    titleEl.textContent = '下载本课本 PDF';
    subtitleEl.textContent = '高清原版 · 一键导出';
  }

  function ensureButton() {
    const iframe = findPdfIframe();
    if (!iframe) {
      const existing = document.getElementById('smartedu-pdf-downloader-container');
      if (existing) existing.remove();
      return;
    }

    if (document.getElementById('smartedu-pdf-downloader-container')) {
      return;
    }

    const container = document.createElement('div');
    container.id = 'smartedu-pdf-downloader-container';
    container.innerHTML = `
      <div class="smartedu-toast"></div>
      <div class="smartedu-fab-btn" title="点击下载当前完整教材 PDF">
        <div class="smartedu-fab-icon">${ICONS.download}</div>
        <div class="smartedu-fab-content">
          <span class="smartedu-fab-title">下载本课本 PDF</span>
          <span class="smartedu-fab-subtitle">高清原版 · 一键导出</span>
        </div>
      </div>
    `;

    container.querySelector('.smartedu-fab-btn').addEventListener('click', () => {
      startDownload(container);
    });

    document.body.appendChild(container);
  }

  const observer = new MutationObserver(() => {
    ensureButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  ensureButton();
  setInterval(ensureButton, 1500);

})();
