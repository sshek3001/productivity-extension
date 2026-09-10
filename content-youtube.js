// Runs on youtube.com/watch pages. YouTube is a single-page app, so we can't
// rely on script re-injection for navigation between videos — we listen for
// YouTube's own navigation event plus a fallback poll.

let lastVideoId = null;

function getVideoId() {
  const params = new URLSearchParams(location.search);
  return params.get("v");
}

function getTitle() {
  const el = document.querySelector(
    "ytd-watch-metadata h1 yt-formatted-string, #title h1 yt-formatted-string"
  );
  if (el && el.textContent.trim()) return el.textContent.trim();
  return document.title.replace(/\s*-\s*YouTube$/, "").trim();
}

function getChannel() {
  const el = document.querySelector(
    "ytd-channel-name #text, #channel-name a, ytd-video-owner-renderer a"
  );
  return el ? el.textContent.trim() : "";
}

function getDescription() {
  const el = document.querySelector(
    "#description-inline-expander, ytd-text-inline-expander #snippet-text"
  );
  return el ? el.textContent.trim() : "";
}

function reportVideoIfChanged() {
  const videoId = getVideoId();
  if (!videoId || videoId === lastVideoId) return;

  // Title/channel elements can lag behind the URL change during SPA nav,
  // so wait a beat before reading the DOM.
  setTimeout(() => {
    const currentId = getVideoId();
    if (currentId !== videoId) return; // navigated again already
    lastVideoId = videoId;
    chrome.runtime.sendMessage({
      type: "VIDEO_DETECTED",
      payload: {
        videoId,
        title: getTitle(),
        channel: getChannel(),
        description: getDescription()
      }
    });
  }, 800);
}

// YouTube fires this custom event on SPA navigation.
document.addEventListener("yt-navigate-finish", reportVideoIfChanged);

// Fallback in case the event above doesn't fire (e.g. very first load).
reportVideoIfChanged();
setInterval(reportVideoIfChanged, 3000);
