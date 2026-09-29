// Runner Remix service worker.
// 1) Opens the game once after install.
// 2) Optional "offline takeover": if you grant the webNavigation permission, pages that fail
//    with "No internet" (and chrome://dino, which Chrome implements as that same error) open
//    the game instead. Chrome's own error page can't be scripted by extensions, so we swap the tab.

const GAME = 'game.html';
const OFFLINE_ERRORS = new Set(['net::ERR_INTERNET_DISCONNECTED']);
// These can mean "offline" too, but only trust them when the browser says we're offline.
const MAYBE_OFFLINE = new Set([
  'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_NAME_RESOLUTION_FAILED', 'net::ERR_NETWORK_CHANGED',
  'net::ERR_ADDRESS_UNREACHABLE', 'net::ERR_PROXY_CONNECTION_FAILED', 'net::ERR_CONNECTION_TIMED_OUT', 'net::ERR_TIMED_OUT',
]);
const BACK_BUTTON_WINDOW = 30 * 60 * 1000;

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL(GAME + '?welcome=1') });
});

chrome.commands?.onCommand.addListener(cmd => {
  if (cmd === 'open-game') chrome.tabs.create({ url: chrome.runtime.getURL(GAME) });
});

async function onNavigationError(d) {
  if (d.frameId !== 0 || d.tabId < 0) return;
  if (d.documentLifecycle && d.documentLifecycle !== 'active') return; // prerender etc.
  const isDino = /^chrome:\/\/dino\/?$/i.test(d.url);
  const isWeb = /^https?:/i.test(d.url);
  if (!isDino && !isWeb) return;
  const offline = OFFLINE_ERRORS.has(d.error) || (MAYBE_OFFLINE.has(d.error) && navigator.onLine === false);
  if (!offline) return;
  if (!(await chrome.permissions.contains({ permissions: ['webNavigation'] }))) return;

  // If the same page fails again soon after we swapped it (usually the Back button),
  // let Chrome show its own page once so Back keeps working. "Try again" sets retry.
  const key = 'redir:' + d.tabId;
  const rec = (await chrome.storage.session.get(key))[key];
  if (rec && rec.url === d.url && !rec.retry && Date.now() - rec.at < BACK_BUTTON_WINDOW) {
    await chrome.storage.session.remove(key);
    return;
  }
  await chrome.storage.session.set({ [key]: { url: d.url, at: Date.now(), retry: false } });
  const target = chrome.runtime.getURL(GAME) + '?offline=1&from=' + encodeURIComponent(d.url);
  try { await chrome.tabs.update(d.tabId, { url: target }); } catch (e) { /* tab closed */ }
}

// Listeners must be registered synchronously at startup; webNavigation only exists once granted.
let listening = false;
function listen() {
  if (listening || !chrome.webNavigation) return;
  chrome.webNavigation.onErrorOccurred.addListener(onNavigationError);
  listening = true;
}
listen();
chrome.permissions.onAdded.addListener(listen);
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove('redir:' + tabId); });
