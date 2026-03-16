// monitor.js — Auto-draft monitor with live streaming

const $ = (sel) => document.querySelector(sel);
let port = null;
let feedItems = {}; // keyed by message id
let statsDone = 0;
let statsError = 0;

function connectPort() {
  port = messenger.runtime.connect({ name: "autodraft-monitor" });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case "queued":
        addFeedItem(msg);
        updateStats();
        break;
      case "start":
        updateFeedItem(msg.msgId, "processing", "");
        updateStats();
        break;
      case "chunk":
        appendChunk(msg.msgId, msg.text);
        break;
      case "done":
        updateFeedItem(msg.msgId, "done", null, msg.elapsed);
        statsDone++;
        updateStats();
        break;
      case "error":
        updateFeedItem(msg.msgId, "error", null, null, msg.error);
        statsError++;
        updateStats();
        break;
      case "settings":
        updateToggle(msg.autoDraft);
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    // Reconnect after a short delay
    setTimeout(connectPort, 1000);
  });

  // Request current state
  port.postMessage({ action: "getState" });
}

function addFeedItem(msg) {
  const id = msg.msgId;
  if (feedItems[id]) return;

  // Hide empty state
  const empty = $("#empty-state");
  if (empty) empty.style.display = "none";

  feedItems[id] = {
    status: "queued",
    subject: msg.subject || "(no subject)",
    from: msg.from || "",
    text: "",
    startTime: null,
    elapsed: null,
  };

  const feed = $("#feed");
  const el = document.createElement("div");
  el.className = "feed-item queued";
  el.id = `feed-${id}`;

  const header = document.createElement("div");
  header.className = "feed-header";

  const info = document.createElement("div");
  const subjectEl = document.createElement("div");
  subjectEl.className = "feed-subject";
  subjectEl.textContent = msg.subject || "(no subject)";
  const fromEl = document.createElement("div");
  fromEl.className = "feed-from";
  fromEl.textContent = msg.from || "";
  info.appendChild(subjectEl);
  info.appendChild(fromEl);

  const badge = document.createElement("span");
  badge.className = "feed-badge badge-queued";
  badge.id = `badge-${id}`;
  badge.textContent = "待機中";

  header.appendChild(info);
  header.appendChild(badge);

  const stream = document.createElement("div");
  stream.className = "feed-stream";
  stream.id = `stream-${id}`;
  stream.style.display = "none";

  const meta = document.createElement("div");
  meta.className = "feed-meta";
  meta.id = `meta-${id}`;

  el.appendChild(header);
  el.appendChild(stream);
  el.appendChild(meta);

  // Insert at top
  feed.insertBefore(el, feed.firstChild);
}

function updateFeedItem(id, status, text, elapsed, error) {
  const item = feedItems[id];
  if (!item) return;
  item.status = status;

  const el = $(`#feed-${id}`);
  const badge = $(`#badge-${id}`);
  const stream = $(`#stream-${id}`);
  const meta = $(`#meta-${id}`);
  if (!el) return;

  // Update card style
  el.className = `feed-item ${status}`;

  // Update badge
  const badges = {
    queued: { cls: "badge-queued", text: "待機中" },
    processing: { cls: "badge-processing", text: "生成中..." },
    done: { cls: "badge-done", text: "完了 ✓" },
    error: { cls: "badge-error", text: "エラー" },
  };
  const b = badges[status] || badges.queued;
  badge.className = `feed-badge ${b.cls}`;
  badge.textContent = b.text;

  if (status === "processing") {
    item.startTime = Date.now();
    stream.style.display = "block";
    stream.classList.add("active");
    stream.textContent = "";
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    stream.appendChild(cursor);
  }

  if (status === "done") {
    stream.classList.remove("active");
    // Remove cursor
    const cursor = stream.querySelector(".cursor");
    if (cursor) cursor.remove();
    if (elapsed) {
      meta.textContent = `${(elapsed / 1000).toFixed(1)}秒 ・ 下書きに保存済み`;
    } else {
      meta.textContent = "下書きに保存済み";
    }
  }

  if (status === "error") {
    stream.style.display = "block";
    stream.classList.remove("active");
    stream.textContent = `エラー: ${error || "不明なエラー"}`;
  }
}

function appendChunk(id, text) {
  const stream = $(`#stream-${id}`);
  if (!stream) return;

  // Remove cursor, append text, re-add cursor
  const cursor = stream.querySelector(".cursor");
  if (cursor) cursor.remove();

  stream.appendChild(document.createTextNode(text));
  const newCursor = document.createElement("span");
  newCursor.className = "cursor";
  stream.appendChild(newCursor);

  // Auto-scroll
  stream.scrollTop = stream.scrollHeight;

  // Update elapsed
  const item = feedItems[id];
  if (item && item.startTime) {
    const meta = $(`#meta-${id}`);
    if (meta) {
      const sec = ((Date.now() - item.startTime) / 1000).toFixed(0);
      meta.textContent = `${sec}秒...`;
    }
  }
}

function updateStats() {
  const queueCount = Object.values(feedItems).filter(
    (i) => i.status === "queued" || i.status === "processing"
  ).length;
  $("#stat-queue").textContent = queueCount;
  $("#stat-done").textContent = statsDone;
  $("#stat-error").textContent = statsError;
}

async function updateToggle(isOn) {
  const toggle = $("#auto-toggle");
  if (isOn) {
    toggle.classList.add("on");
  } else {
    toggle.classList.remove("on");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  connectPort();

  // Load initial toggle state
  const settings = await messenger.runtime.sendMessage({
    action: "getSettings",
  });
  updateToggle(settings.autoDraft);

  // Toggle auto-draft
  $("#auto-toggle").addEventListener("click", async () => {
    const settings = await messenger.runtime.sendMessage({
      action: "getSettings",
    });
    settings.autoDraft = !settings.autoDraft;
    await messenger.storage.local.set({ settings });
    updateToggle(settings.autoDraft);

    if (port) {
      port.postMessage({
        action: "toggleAutoDraft",
        enabled: settings.autoDraft,
      });
    }
  });
});
