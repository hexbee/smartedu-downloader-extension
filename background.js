// background.js - Service Worker for SmartEdu PDF Downloader

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadFile') {
    const { url, filename, headers } = request;

    const downloadOptions = {
      url: url,
      filename: filename,
      saveAs: false
    };

    if (headers && Object.keys(headers).length > 0) {
      downloadOptions.headers = Object.entries(headers).map(([name, value]) => ({
        name,
        value: String(value)
      }));
    }

    chrome.downloads.download(downloadOptions, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });

    return true;
  }
});
