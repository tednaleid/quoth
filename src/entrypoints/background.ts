export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[quoth] Message received:', message);
    return false;
  });
});
