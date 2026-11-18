// Suppress unhandled WebSocket connection errors from disabled HMR in iframe/dev proxy
window.addEventListener(
  'error',
  function (e) {
    if (e && (e.message?.includes('WebSocket') || e.filename?.includes('vite/client'))) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true
);

window.addEventListener('unhandledrejection', function (e) {
  if (e && e.reason && String(e.reason).includes('WebSocket')) {
    e.preventDefault();
  }
});
