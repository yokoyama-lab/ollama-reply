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
  el.innerHTML = `
    <div class="feed-header">
      <div>
        <div class="feed-subject">${escapeHtml(msg.subject || "(no subject)")}</div>
        <div class="feed-from">${escapeHtml(msg.from || "")}</div>
      </div>
      <span class="feed-badge badge-queued" id="badge-${id}">待機中</span>
    </div>
    <div class="feed-stream" id="stream-${id}" style="display:none;"></div>
    <div class="feed-meta" id="meta-${id}"></div>
  `;

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
    stream.innerHTML = '<span class="cursor"></span>';
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

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
