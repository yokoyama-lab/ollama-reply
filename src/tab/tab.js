// tab.js — Ollama Reply v3.5.0

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const i18n = (key, subs) => messenger.i18n.getMessage(key, subs);

let currentMessage = null;
let threadMessages = [];
let candidates = []; 
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

// --- Markdown Renderer (Lightweight) ---
function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Bullets
    .replace(/^\s*[-*+]\s+(.*)$/gm, "<ul><li>$1</li></ul>")
    .replace(/<\/ul>\n<ul>/g, "")
    // Numbered lists
    .replace(/^\s*\d+\.\s+(.*)$/gm, "<ol><li>$1</li></ol>")
    .replace(/<\/ol>\n<ol>/g, "")
    // Paragraphs
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  
  return `<p>${html}</p>`;
}

function updatePreview() {
  const text = $("#reply-text").value;
  const area = $("#preview-area");
  if ($("#opt-preview").checked) {
    area.innerHTML = renderMarkdown(text);
  }
}

// --- Message Loading ---
async function loadMessage() {
  try {
    setStatus("Loading...");
    const params = new URLSearchParams(window.location.search);
    const sourceTabId = parseInt(params.get("tabId"));
    if (!sourceTabId) {
      setStatus("No message tab info", "error");
      return;
    }

    const message = await messenger.runtime.sendMessage({
      action: "getDisplayedMessage", tabId: sourceTabId,
    });
    if (message.error) { setStatus(message.error, "error"); return; }

    currentMessage = message;
    $("#mail-subject").textContent = message.subject;
    $("#mail-from").textContent = message.author;
    $("#mail-date").textContent = message.date;
    $("#mail-body").textContent = message.body.substring(0, 500) +
      (message.body.length > 500 ? "..." : "");
    $("#mail-info").classList.add("show");
    $("#btn-generate").disabled = false;

    if ($("#opt-thread").checked) {
      try {
        threadMessages = await messenger.runtime.sendMessage({
          action: "getThreadMessages", messageId: message.id,
        });
        if (threadMessages && threadMessages.length > 1) {
          const badge = $("#thread-badge");
          badge.textContent = `Thread: ${threadMessages.length}`;
          badge.style.display = "inline-block";
        }
      } catch (e) { threadMessages = []; }
    }
    setStatus("");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
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
      select.innerHTML = `<option value="">(Conn Error)</option>`; 
      return; 
    }
    select.innerHTML = "";
    for (const name of res.models) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === settings.model) opt.selected = true;
      select.appendChild(opt);
    }
  } catch (err) { select.innerHTML = `<option value="">(Load Error)</option>`; }
}

async function loadTemplates() {
  const select = $("#template");
  try {
    const templates = await messenger.runtime.sendMessage({ action: "getTemplates" });
    select.innerHTML = "";
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      opt.dataset.prompt = t.prompt || "";
      select.appendChild(opt);
    }
  } catch (e) { select.innerHTML = `<option value="">Default</option>`; }
}

// --- Streaming Generation ---
async function generateStreaming(candidateIdx, refinementPrompt = null) {
  const model = $("#model").value;
  if (!model) { setStatus("Select a model", "error"); return null; }

  let systemPrompt, userPrompt;

  if (refinementPrompt) {
    const currentReply = candidates[candidateIdx].text;
    systemPrompt = "You are an email editor. Rewrite the following email reply based on the user's instructions. Keep the context of original thread. Output only the revised reply body.";
    userPrompt = `Original reply:\n---\n${currentReply}\n---\n\nInstructions: ${refinementPrompt}\n\nRevised reply:`;
  } else {
    const templateOpt = $("#template").selectedOptions[0];
    const templatePrompt = templateOpt ? templateOpt.dataset.prompt || "" : "";
    const promptData = await messenger.runtime.sendMessage({
      action: "getBuildPrompt",
      message: currentMessage,
      tone: $("#tone").value,
      language: $("#language").value,
      templatePrompt,
      threadMessages: $("#opt-thread").checked ? threadMessages : [],
    });
    if (promptData.error) throw new Error(promptData.error);
    systemPrompt = promptData.systemPrompt;
    userPrompt = promptData.userPrompt;
  }

  return new Promise((resolve, reject) => {
    const port = messenger.runtime.connect({ name: "ollama-stream" });
    let fullText = "";

    port.onMessage.addListener((msg) => {
      if (msg.chunk) {
        fullText += msg.chunk;
        if (candidateIdx === activeCandidateIdx) {
          $("#reply-text").value = fullText;
          updatePreview();
          $("#reply-text").scrollTop = $("#reply-text").scrollHeight;
        }
        candidates[candidateIdx].text = fullText;
      }
      if (msg.done) { port.disconnect(); resolve(fullText); }
      if (msg.error) { port.disconnect(); reject(new Error(msg.error)); }
    });

    port.postMessage({
      action: "streamGenerate",
      model, systemPrompt, userPrompt,
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
    const tab = document.createElement("div");
    tab.className = `candidate-tab ${i === activeCandidateIdx ? "active" : ""}`;
    tab.textContent = `Candidate ${i + 1}`;
    
    tab.addEventListener("click", () => {
      activeCandidateIdx = i;
      renderCandidateTabs();
      $("#reply-text").value = candidates[i].text;
      updatePreview();
    });
    container.appendChild(tab);
  });
}

// --- Main Generate ---
async function generateReply() {
  if (!currentMessage) return;
  const numCandidates = parseInt($("#num-candidates").value) || 1;
  const model = $("#model").value;

  try {
    $("#btn-generate").disabled = true;
    setStatus(i18n("statusGenerating", [model, numCandidates.toString()]), "generating");
    startTimer();

    candidates = [];
    activeCandidateIdx = 0;
    for (let i = 0; i < numCandidates; i++) {
      candidates.push({ text: "", model, tone: $("#tone").value });
    }

    $("#reply-section").classList.add("show");
    $("#reply-text").value = "";
    updatePreview();
    renderCandidateTabs();

    for (let i = 0; i < numCandidates; i++) {
      activeCandidateIdx = i;
      renderCandidateTabs();
      await generateStreaming(i);
    }

    stopTimer();
    activeCandidateIdx = 0;
    renderCandidateTabs();
    $("#reply-text").value = candidates[0].text;
    updatePreview();
    setStatus(i18n("statusDone", [numCandidates.toString(), $("#timer").textContent]), "success");
  } catch (err) {
    stopTimer();
    setStatus(`Error: ${err.message}`, "error");
  } finally {
    $("#btn-generate").disabled = false;
  }
}

// --- Refine Reply ---
async function refineReply(promptOverride = null) {
  const refinementPrompt = promptOverride || $("#refine-input").value.trim();
  if (!refinementPrompt || !candidates[activeCandidateIdx]) return;

  try {
    $("#btn-refine").disabled = true;
    setStatus("Refining...", "generating");
    startTimer();

    const text = await generateStreaming(activeCandidateIdx, refinementPrompt);
    candidates[activeCandidateIdx].text = text;

    stopTimer();
    $("#refine-input").value = "";
    updatePreview();
    setStatus("✅ Refined!", "success");
  } catch (err) {
    stopTimer();
    setStatus(`Error: ${err.message}`, "error");
  } finally {
    $("#btn-refine").disabled = false;
  }
}

async function openReply(replyType) {
  if (!currentMessage || !candidates[activeCandidateIdx]) return;
  const replyBody = $("#reply-text").value;
  if (!replyBody.trim()) return;

  await messenger.runtime.sendMessage({
    action: "openReplyCompose",
    messageId: currentMessage.id,
    replyBody,
    replyType,
    includeSignature: $("#opt-signature").checked,
  });
}

function initI18n() {
  $("#lbl-tone").textContent = i18n("tonePolite");
  $("#lbl-lang").textContent = i18n("langEn");
  $("#btn-generate").textContent = i18n("btnGenerate");
  $("#btn-refine").textContent = i18n("btnRefine");
  $("#refine-input").placeholder = i18n("refinePlaceholder");
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  initI18n();
  loadMessage();
  loadModels();
  loadTemplates();

  $("#btn-generate").addEventListener("click", generateReply);
  $("#btn-regenerate").addEventListener("click", generateReply);
  $("#btn-refine").addEventListener("click", () => refineReply());
  $("#refine-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") refineReply();
  });

  // Quick actions
  $$(".action-chip").forEach(chip => {
    chip.addEventListener("click", () => refineReply(chip.dataset.prompt));
  });

  // Preview toggle
  $("#opt-preview").addEventListener("change", (e) => {
    if (e.target.checked) {
      $("#reply-text").style.display = "none";
      $("#preview-area").classList.add("show");
      updatePreview();
    } else {
      $("#reply-text").style.display = "block";
      $("#preview-area").classList.remove("show");
    }
  });

  $("#reply-text").addEventListener("input", updatePreview);

  $("#btn-use-reply").addEventListener("click", () => openReply("replyToSender"));
  $("#btn-use-reply-all").addEventListener("click", () => openReply("replyToAll"));
  $("#btn-copy").addEventListener("click", async () => {
    const text = $("#reply-text").value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const btn = $("#btn-copy");
    const orig = btn.textContent;
    btn.textContent = "✅ Copied";
    setTimeout(() => btn.textContent = orig, 1500);
  });

  $("#toggle-monitor").addEventListener("click", () => messenger.tabs.create({ url: "/monitor/monitor.html" }));
  $("#toggle-history").addEventListener("click", () => $("#history-panel").style.display = $("#history-panel").style.display === "none" ? "block" : "none");
  $("#toggle-templates").addEventListener("click", () => $("#template-editor").style.display = $("#template-editor").style.display === "none" ? "block" : "none");
});
