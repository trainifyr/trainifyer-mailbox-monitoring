// Dynamically loads the Jitsi Meet external API script.
// Returns a promise that resolves when the script is loaded.
// Subsequent calls return the already-resolved promise.

let loadPromise = null;

export default function loadJitsiScript() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.JitsiMeetExternalAPI) {
      resolve(window.JitsiMeetExternalAPI);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://meet.guifi.net/external_api.js';
    script.async = true;
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) {
        resolve(window.JitsiMeetExternalAPI);
      } else {
        reject(new Error('JitsiMeetExternalAPI not found after script load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Jitsi Meet script'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
