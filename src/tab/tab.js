// tab.js — Ollama Reply v3.0.0

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
let currentMessage = null;
let threadMessages = [];
let candidates = []; // Array of { text, model, tone }
let activeCandidateIdx = 0;
let timerInterval = null;

// --- Status & Timer ---
function setStatus(text, type = "info") {
  const el = $("#status");
  el.textContent = text;
  el.className = `status ${type}`;
}

function startTimer() {
  const el = $("#timer");
  const start = Date.now();
  el.textContent = "0s";
  timerInterval = setInterval(() => {
    el.textContent = `${Math.floor((Date.now() - start) / 1000)}s`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// --- Message Loading ---
async function loadMessage() {
  try {
    setStatus("メール読み込み中...");
    const params = new URLSearchParams(window.location.search);
    const sourceTabId = parseInt(params.get("tabId"));
    if (!sourceTabId) {
      setStatus("メールタブ情報がありません", "error");
      return;
    }

    const message = await messenger.runtime.sendMessage({
      action: "getDisplayedMessage", tabId: sourceTabId,
    });
    if (message.error) { setStatus(message.error, "error"); return; }

    currentMessage = message;
    $("#mail-subject").textContent = `件名: ${message.subject}`;
    $("#mail-from").textContent = `差出人: ${message.author}`;
    $("#mail-date").textContent = `日時: ${message.date}`;
    $("#mail-body").textContent = message.body.substring(0, 500) +
      (message.body.length > 500 ? "..." : "");
    $("#mail-info").classList.add("show");
    $("#btn-generate").disabled = false;

    // Load thread context
    if ($("#opt-thread").checked) {
      try {
        threadMessages = await messenger.runtime.sendMessage({
          action: "getThreadMessages", messageId: message.id, depth: 3,
        });
        if (threadMessages && threadMessages.length > 1) {
          const badge = $("#thread-badge");
          badge.textContent = `スレッド: ${threadMessages.length}通`;
          badge.style.display = "inline-block";
        }
      } catch (e) {
        threadMessages = [];
      }
    }

    setStatus("");
  } catch (err) {
    setStatus(`エラー: ${err.message}`, "error");
  }
}

// --- Model & Template Loading ---
async function loadModels() {
  const select = $("#model");
  try {
    const settings = await messenger.runtime.sendMessage({ action: "getSettings" });
    const res = await messenger.runtime.sendMessage({
      action: "testConnection", url: settings.ollamaUrl,
    });
    if (res.error) {
      select.textContent = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(接続エラー)";
      select.appendChild(opt);
      return;
    }

    select.textContent = "";
    for (const name of res.models) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === settings.model) opt.selected = true;
      select.appendChild(opt);
    }
  } catch (err) {
    select.textContent = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(読込失敗)";
    select.appendChild(opt);
  }
}

async function loadTemplates() {
  const select = $("#template");
  try {
    const templates = await messenger.runtime.sendMessage({ action: "getTemplates" });
    select.textContent = "";
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      opt.dataset.prompt = t.prompt || "";
      select.appendChild(opt);
    }
  } catch (e) {
    select.textContent = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "一般返信";
    select.appendChild(opt);
  }
}

// --- Streaming Generation ---
async function generateStreaming(candidateIdx) {
  const model = $("#model").value;
  if (!model) { setStatus("モデルを選択してください", "error"); return null; }

  const templateOpt = $("#template").selectedOptions[0];
  const templatePrompt = templateOpt ? templateOpt.dataset.prompt || "" : "";

  // Get prompt from background
  const promptData = await messenger.runtime.sendMessage({
    action: "getBuildPrompt",
    message: currentMessage,
    tone: $("#tone").value,
    language: $("#language").value,
    templatePrompt,
    threadMessages: $("#opt-thread").checked ? threadMessages : [],
  });

  if (promptData.error) throw new Error(promptData.error);

  return new Promise((resolve, reject) => {
    const port = messenger.runtime.connect({ name: "ollama-stream" });
    let fullText = "";

    port.onMessage.addListener((msg) => {
      if (msg.chunk) {
        fullText += msg.chunk;
        // Update textarea if this is the active candidate
        if (candidateIdx === activeCandidateIdx) {
          $("#reply-text").value = fullText;
          // Auto-scroll to bottom
          const ta = $("#reply-text");
          ta.scrollTop = ta.scrollHeight;
        }
        candidates[candidateIdx].text = fullText;
      }
      if (msg.done) {
        port.disconnect();
        resolve(fullText);
      }
      if (msg.error) {
        port.disconnect();
        reject(new Error(msg.error));
      }
    });

    port.postMessage({
      action: "streamGenerate",
      model,
      systemPrompt: promptData.systemPrompt,
      userPrompt: promptData.userPrompt,
    });
  });
}

// --- Candidate Tabs ---
function renderCandidateTabs() {
  const container = $("#candidate-tabs");
  container.textContent = "";

  if (candidates.length <= 1) {
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";

  candidates.forEach((c, i) => {
    const tab = document.createElement("button");
    tab.className = `candidate-tab ${i === activeCandidateIdx ? "active" : ""}`;
    tab.textContent = `候補 ${i + 1}`;
    if (candidates.length > 1) {
      const closeBtn = document.createElement("span");
      closeBtn.className = "close-tab";
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        candidates.splice(i, 1);
        if (activeCandidateIdx >= candidates.length) activeCandidateIdx = candidates.length - 1;
        renderCandidateTabs();
        $("#reply-text").value = candidates[activeCandidateIdx]?.text || "";
      });
      tab.appendChild(closeBtn);
    }
    tab.addEventListener("click", () => {
      activeCandidateIdx = i;
      renderCandidateTabs();
      $("#reply-text").value = candidates[i].text;
    });
    container.appendChild(tab);
  });
}

// --- Main Generate ---
async function generateReply() {
  if (!currentMessage) return;

  const numCandidates = parseInt($("#num-candidates").value) || 1;

  try {
    $("#btn-generate").disabled = true;
    $("#btn-regenerate").disabled = true;

    const model = $("#model").value;
    setStatus(`返信を生成中... (${model}, ${numCandidates}候補)`, "generating");
    startTimer();

    // Reset candidates
    candidates = [];
    activeCandidateIdx = 0;

    for (let i = 0; i < numCandidates; i++) {
      candidates.push({ text: "", model, tone: $("#tone").value });
    }

    $("#reply-section").classList.add("show");
    $("#reply-text").value = "";
    renderCandidateTabs();

    // Generate candidates (sequentially for CPU-based Ollama)
    for (let i = 0; i < numCandidates; i++) {
      activeCandidateIdx = i;
      renderCandidateTabs();

      if (numCandidates > 1) {
        setStatus(`候補 ${i + 1}/${numCandidates} を生成中... (${model})`, "generating");
      }

      const text = await generateStreaming(i);
      candidates[i].text = text;

      // Save to history
      await messenger.runtime.sendMessage({
        action: "getSettings",
      }).then(async (settings) => {
        // History is saved in background via generateReply for non-streaming
        // For streaming, save manually
      });
    }

    stopTimer();

    // Save last generation to history
    const templateOpt = $("#template").selectedOptions[0];
    // Use a direct storage call for history
    try {
      const stored = await messenger.storage.local.get("history");
      const history = stored.history || [];
      history.unshift({
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        subject: currentMessage.subject,
        author: currentMessage.author,
        tone: $("#tone").value,
        language: $("#language").value,
        model,
        reply: candidates[0].text,
        candidateCount: numCandidates,
      });
      if (history.length > 50) history.length = 50;
      await messenger.storage.local.set({ history });
    } catch (e) { /* ignore history save errors */ }

    // Show first candidate
    activeCandidateIdx = 0;
    renderCandidateTabs();
    $("#reply-text").value = candidates[0].text;

    setStatus(
      `✅ ${numCandidates}候補を生成しました (${$("#timer").textContent})`,
      "success"
    );
  } catch (err) {
    stopTimer();
    setStatus(`エラー: ${err.message}`, "error");
  } finally {
    $("#btn-generate").disabled = false;
    $("#btn-regenerate").disabled = false;
  }
}

// --- Reply compose ---
async function openReply(replyType) {
  if (!currentMessage || !candidates[activeCandidateIdx]) return;
  const replyBody = $("#reply-text").value;
  if (!replyBody.trim()) return;

  try {
    const result = await messenger.runtime.sendMessage({
      action: "openReplyCompose",
      messageId: currentMessage.id,
      replyBody,
      replyType,
      includeSignature: $("#opt-signature").checked,
    });
    if (result.error) { setStatus(`エラー: ${result.error}`, "error"); return; }
    setStatus("✅ 返信ウィンドウを開きました（引用付き）", "success");
  } catch (err) {
    setStatus(`エラー: ${err.message}`, "error");
  }
}

// --- History ---
async function loadHistory() {
  const list = $("#history-list");
  const empty = $("#history-empty");
  try {
    const history = await messenger.runtime.sendMessage({ action: "getHistory" });
    if (!history || history.length === 0) {
      list.textContent = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    list.textContent = "";

    history.forEach((h) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.dataset.reply = h.reply;

      const subject = document.createElement("div");
      subject.className = "h-subject";
      subject.textContent = h.subject;

      const meta = document.createElement("div");
      meta.className = "h-meta";
      meta.textContent = `${new Date(h.timestamp).toLocaleString("ja-JP")} ・ ${h.model} ・ ${h.tone} ・ ${h.language}`;

      const preview = document.createElement("div");
      preview.className = "h-preview";
      preview.textContent = h.reply.substring(0, 100);

      item.appendChild(subject);
      item.appendChild(meta);
      item.appendChild(preview);

      item.addEventListener("click", () => {
        const reply = item.dataset.reply;
        candidates = [{ text: reply, model: "", tone: "" }];
        activeCandidateIdx = 0;
        renderCandidateTabs();
        $("#reply-text").value = reply;
        $("#reply-section").classList.add("show");
        setStatus("履歴から復元しました", "success");
      });

      list.appendChild(item);
    });
  } catch (e) {
    list.textContent = "";
    empty.style.display = "block";
  }
}

// --- Template Editor ---
async function loadTemplateEditor() {
  const list = $("#template-list");
  try {
    const templates = await messenger.runtime.sendMessage({ action: "getTemplates" });
    renderTemplateEditor(templates);
  } catch (e) {
    list.textContent = "";
    const p = document.createElement("p");
    p.textContent = "読み込みエラー";
    list.appendChild(p);
  }
}

function renderTemplateEditor(templates) {
  const list = $("#template-list");
  list.textContent = "";

  templates.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "tpl-item";
    item.dataset.idx = i;

    const nameInput = document.createElement("input");
    nameInput.className = "tpl-name";
    nameInput.value = t.name;
    nameInput.placeholder = "名前";

    const promptInput = document.createElement("input");
    promptInput.className = "tpl-prompt";
    promptInput.value = t.prompt || "";
    promptInput.placeholder = "プロンプト（空=一般返信）";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-secondary btn-sm tpl-delete";
    deleteBtn.dataset.idx = i;
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", () => {
      templates.splice(i, 1);
      renderTemplateEditor(templates);
    });

    item.appendChild(nameInput);
    item.appendChild(promptInput);
    item.appendChild(deleteBtn);
    list.appendChild(item);
  });

  // Store reference for save
  list.dataset.templates = JSON.stringify(templates);
}

function getTemplatesFromEditor() {
  const items = $$("#template-list .tpl-item");
  return Array.from(items).map((item) => ({
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: item.querySelector(".tpl-name").value,
    prompt: item.querySelector(".tpl-prompt").value,
  }));
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  loadMessage();
  loadModels();
  loadTemplates();

  // Generate
  $("#btn-generate").addEventListener("click", generateReply);
  $("#btn-regenerate").addEventListener("click", generateReply);

  // Reply
  $("#btn-use-reply").addEventListener("click", () => openReply("replyToSender"));
  $("#btn-use-reply-all").addEventListener("click", () => openReply("replyToAll"));

  // Copy
  $("#btn-copy").addEventListener("click", async () => {
    const text = $("#reply-text").value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const btn = $("#btn-copy");
      const orig = btn.textContent;
      btn.textContent = "✅ コピー完了";
      setTimeout(() => (btn.textContent = orig), 1500);
    } catch (e) {
      setStatus("コピーに失敗しました", "error");
    }
  });

  // Toggle panels
  $("#toggle-monitor").addEventListener("click", async () => {
    await messenger.tabs.create({ url: "/monitor/monitor.html" });
  });

  $("#toggle-history").addEventListener("click", () => {
    const panel = $("#history-panel");
    const btn = $("#toggle-history");
    const isOpen = panel.classList.toggle("show");
    btn.classList.toggle("active", isOpen);
    if (isOpen) {
      loadHistory();
      // Close template editor
      $("#template-editor").classList.remove("show");
      $("#toggle-templates").classList.remove("active");
    }
  });

  $("#toggle-templates").addEventListener("click", () => {
    const panel = $("#template-editor");
    const btn = $("#toggle-templates");
    const isOpen = panel.classList.toggle("show");
    btn.classList.toggle("active", isOpen);
    if (isOpen) {
      loadTemplateEditor();
      // Close history
      $("#history-panel").classList.remove("show");
      $("#toggle-history").classList.remove("active");
    }
  });

  // Clear history
  $("#btn-clear-history").addEventListener("click", async () => {
    if (!confirm("履歴をすべて削除しますか？")) return;
    await messenger.runtime.sendMessage({ action: "clearHistory" });
    loadHistory();
  });

  // Add template
  $("#btn-add-template").addEventListener("click", () => {
    const templates = getTemplatesFromEditor();
    templates.push({ id: `tpl_new`, name: "新規テンプレート", prompt: "" });
    renderTemplateEditor(templates);
  });

  // Save templates
  $("#btn-save-templates").addEventListener("click", async () => {
    const templates = getTemplatesFromEditor();
    await messenger.runtime.sendMessage({ action: "saveTemplates", templates });
    loadTemplates(); // Refresh dropdown
    setStatus("✅ テンプレートを保存しました", "success");
  });

  // Thread context toggle
  $("#opt-thread").addEventListener("change", async () => {
    if ($("#opt-thread").checked && currentMessage) {
      try {
        threadMessages = await messenger.runtime.sendMessage({
          action: "getThreadMessages", messageId: currentMessage.id, depth: 3,
        });
        if (threadMessages.length > 1) {
          const badge = $("#thread-badge");
          badge.textContent = `スレッド: ${threadMessages.length}通`;
          badge.style.display = "inline-block";
        }
      } catch (e) { threadMessages = []; }
    } else {
      threadMessages = [];
      $("#thread-badge").style.display = "none";
    }
  });
});
