// background.js — Ollama Reply v3.2.0

const DEFAULT_SETTINGS = {
  ollamaUrl: "http://localhost:11434",
  model: "gemma3:4b",
  temperature: 0.7,
  maxTokens: 1024,
  threadContext: true,
  threadDepth: 3,
  autoSignature: true,
  autoDraft: false,
  autoDraftTone: "polite",
  autoDraftLanguage: "ja",
};

const DEFAULT_TEMPLATES = [
  { id: "default", name: "一般返信", prompt: "" },
  {
    id: "meeting",
    name: "会議日程調整",
    prompt: "会議の日程調整に関する返信を書いてください。具体的な候補日時を提示してください。",
  },
  {
    id: "review",
    name: "論文レビュー返信",
    prompt:
      "論文のレビューコメントへの返信を書いてください。各コメントに丁寧に回答し、修正した点を明記してください。",
  },
  {
    id: "student",
    name: "学生への連絡",
    prompt:
      "学生への連絡メールとして返信を書いてください。わかりやすく丁寧に、必要な情報を漏れなく伝えてください。",
  },
  {
    id: "decline",
    name: "丁重にお断り",
    prompt:
      "依頼や招待を丁重にお断りする返信を書いてください。感謝を示しつつ、理由を簡潔に述べてください。",
  },
  {
    id: "thanks",
    name: "お礼",
    prompt:
      "お礼のメール返信を書いてください。具体的に何に感謝しているかを明示してください。",
  },
];

// --- Settings ---
async function getSettings() {
  const stored = await messenger.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

// --- Templates ---
async function getTemplates() {
  const stored = await messenger.storage.local.get("templates");
  return stored.templates || DEFAULT_TEMPLATES;
}

async function saveTemplates(templates) {
  await messenger.storage.local.set({ templates });
}

// --- History ---
async function getHistory() {
  const stored = await messenger.storage.local.get("history");
  return stored.history || [];
}

async function addHistory(entry) {
  const history = await getHistory();
  history.unshift({
    ...entry,
    timestamp: Date.now(),
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  // Keep max 50 entries
  if (history.length > 50) history.length = 50;
  await messenger.storage.local.set({ history });
}

// --- Message / Thread ---
async function getDisplayedMessage(tabId) {
  const msgList = await messenger.messageDisplay.getDisplayedMessages(tabId);
  if (!msgList || !msgList.messages || msgList.messages.length === 0) {
    throw new Error("メッセージを選択してください");
  }
  const msg = msgList.messages[0];
  const full = await messenger.messages.getFull(msg.id);
  const body = extractPlainText(full);

  return {
    id: msg.id,
    subject: msg.subject || "(no subject)",
    author: msg.author || "",
    date: msg.date ? new Date(msg.date).toLocaleString("ja-JP") : "",
    body,
    headerMessageId: msg.headerMessageId || "",
  };
}

async function getThreadMessages(messageId, depth) {
  const thread = [];
  try {
    let currentId = messageId;
    for (let i = 0; i < depth; i++) {
      const msg = await messenger.messages.get(currentId);
      if (!msg) break;

      const full = await messenger.messages.getFull(msg.id);
      const body = extractPlainText(full);
      const headers = full.headers || {};

      thread.push({
        subject: msg.subject || "",
        author: msg.author || "",
        date: msg.date ? new Date(msg.date).toLocaleString("ja-JP") : "",
        body: body.substring(0, 1000),
      });

      // Find parent via In-Reply-To header
      const inReplyTo = headers["in-reply-to"]
        ? headers["in-reply-to"][0]
        : null;
      if (!inReplyTo) break;

      // Search for the parent message
      const clean = inReplyTo.replace(/^<|>$/g, "");
      const results = await messenger.messages.query({
        headerMessageId: clean,
      });
      if (!results || !results.messages || results.messages.length === 0)
        break;
      currentId = results.messages[0].id;
    }
  } catch (e) {
    // Thread traversal may fail; return what we have
  }
  return thread.reverse(); // Chronological order
}

function extractPlainText(part) {
  if (part.contentType === "text/plain" && part.body) return part.body;
  if (part.contentType === "text/html" && part.body) {
    return part.body
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  }
  if (part.parts) {
    for (const sub of part.parts) {
      const text = extractPlainText(sub);
      if (text) return text;
    }
  }
  return "";
}

// --- Signature ---
async function getSignature() {
  try {
    const accounts = await messenger.accounts.list();
    for (const acct of accounts) {
      if (acct.identities && acct.identities.length > 0) {
        const identity = acct.identities[0];
        if (identity.signature) {
          // Strip HTML if present
          let sig = identity.signature;
          if (identity.signatureIsPlainText === false) {
            sig = sig.replace(/<[^>]*>/g, "").trim();
          }
          return sig;
        }
      }
    }
  } catch (e) {
    // accountsRead might not be available
  }
  return "";
}

// --- Prompt Building ---
function buildPrompt(message, tone, language, templatePrompt, threadMessages) {
  const toneMap = {
    polite:
      language === "ja" ? "丁寧・敬語を使った" : "polite and formal",
    casual:
      language === "ja"
        ? "カジュアルで親しみやすい"
        : "casual and friendly",
    business:
      language === "ja"
        ? "ビジネスライクで簡潔な"
        : "professional and concise",
    academic:
      language === "ja" ? "学術的で正確な" : "academic and precise",
  };

  const toneDesc = toneMap[tone] || toneMap.polite;
  const langLabel = language === "en" ? "English" : "日本語";

  let systemPrompt =
    language === "ja"
      ? `あなたはメール返信を書くアシスタントです。以下のルールに従ってください：
- ${toneDesc}トーンで返信を書く
- 返信本文のみを出力する（件名や宛先や署名は不要）
- 適切な挨拶と結びを含める
- 元のメールの要点に的確に応答する
- 自然な${langLabel}で書く`
      : `You are an email reply assistant. Follow these rules:
- Write in a ${toneDesc} tone
- Output only the reply body (no subject, headers, or signature)
- Include appropriate greeting and closing
- Address the key points of the original email
- Write naturally in ${langLabel}`;

  if (templatePrompt) {
    systemPrompt += `\n\n追加指示: ${templatePrompt}`;
  }

  // Build thread context
  let threadContext = "";
  if (threadMessages && threadMessages.length > 1) {
    const label = language === "ja" ? "過去のやり取り" : "Previous exchanges";
    threadContext = `\n\n--- ${label} ---\n`;
    // Exclude the last one (= current message, shown separately)
    for (const tm of threadMessages.slice(0, -1)) {
      threadContext += `[${tm.author} / ${tm.date}]\n${tm.body}\n\n`;
    }
    threadContext += "---\n";
  }

  const currentLabel =
    language === "ja" ? "返信対象のメール" : "Email to reply to";
  const userPrompt =
    language === "ja"
      ? `以下のメールへの返信を書いてください。${threadContext}
--- ${currentLabel} ---
差出人: ${message.author}
件名: ${message.subject}
日時: ${message.date}

${message.body}
--- ここまで ---

上記のメールに対する返信を書いてください。`
      : `Please write a reply to the following email.${threadContext}
--- ${currentLabel} ---
From: ${message.author}
Subject: ${message.subject}
Date: ${message.date}

${message.body}
--- End ---

Write a reply to the email above.`;

  return { systemPrompt, userPrompt };
}

// --- Ollama API (non-streaming) ---
async function callOllama(systemPrompt, userPrompt, settings) {
  const response = await fetch(`${settings.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      options: {
        temperature: settings.temperature,
        num_predict: settings.maxTokens,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.message?.content || "";
}

// --- Compose with standard quote ---
async function openReplyCompose(messageId, replyBody, replyType, signature) {
  const type = replyType || "replyToSender";
  const composeTab = await messenger.compose.beginReply(messageId, type);
  await new Promise((r) => setTimeout(r, 500));
  const details = await messenger.compose.getComposeDetails(composeTab.id);

  let fullReply = replyBody;
  if (signature) {
    fullReply += "\n\n-- \n" + signature;
  }

  if (details.isPlainText) {
    const existing = details.plainTextBody || "";
    await messenger.compose.setComposeDetails(composeTab.id, {
      plainTextBody: fullReply + "\n\n" + existing,
    });
  } else {
    const replyHtml = fullReply
      .split("\n")
      .map((l) => `<p>${l || "<br>"}</p>`)
      .join("");
    const existing = details.body || "";
    await messenger.compose.setComposeDetails(composeTab.id, {
      body: replyHtml + "<br>" + existing,
    });
  }
  return composeTab;
}

// --- Streaming via Port ---
function handleStreamingPort(port) {
  port.onMessage.addListener(async (request) => {
    if (request.action !== "streamGenerate") return;

    try {
      const settings = await getSettings();
      const model = request.model || settings.model;

      const response = await fetch(`${settings.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          options: {
            temperature: settings.temperature,
            num_predict: settings.maxTokens,
          },
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        port.postMessage({ error: `HTTP ${response.status}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              port.postMessage({ chunk: json.message.content });
            }
            if (json.done) {
              port.postMessage({ done: true });
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
      port.postMessage({ done: true });
    } catch (err) {
      port.postMessage({ error: err.message });
    }
  });
}

// --- Open tab on button click ---
messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  await messenger.tabs.create({ url: `tab/tab.html?tabId=${tab.id}` });
});

// --- Toolbar button opens monitor ---
messenger.action.onClicked.addListener(async () => {
  await messenger.tabs.create({ url: "monitor/monitor.html" });
});

// --- Keyboard shortcut ---
messenger.commands.onCommand.addListener(async (command) => {
  if (command === "generate-reply") {
    const tabs = await messenger.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length > 0) {
      await messenger.tabs.create({
        url: `tab/tab.html?tabId=${tabs[0].id}`,
      });
    }
  }
});

// --- Message handler ---
messenger.runtime.onMessage.addListener(async (request, sender) => {
  try {
    switch (request.action) {
      case "getDisplayedMessage":
        return await getDisplayedMessage(request.tabId);

      case "getThreadMessages": {
        const settings = await getSettings();
        return await getThreadMessages(
          request.messageId,
          request.depth || settings.threadDepth
        );
      }

      case "generateReply": {
        const settings = await getSettings();
        const model = request.model || settings.model;
        const threadMessages = request.threadMessages || [];
        const { systemPrompt, userPrompt } = buildPrompt(
          request.message,
          request.tone,
          request.language,
          request.templatePrompt,
          threadMessages
        );
        const overrideSettings = { ...settings, model };
        const reply = await callOllama(
          systemPrompt,
          userPrompt,
          overrideSettings
        );

        // Save to history
        await addHistory({
          subject: request.message.subject,
          author: request.message.author,
          tone: request.tone,
          language: request.language,
          model,
          reply,
        });

        return { reply, systemPrompt, userPrompt };
      }

      case "openReplyCompose": {
        const settings = await getSettings();
        let signature = "";
        if (settings.autoSignature) {
          signature = await getSignature();
        }
        await openReplyCompose(
          request.messageId,
          request.replyBody,
          request.replyType,
          request.includeSignature ? signature : ""
        );
        return { success: true };
      }

      case "getSettings":
        return await getSettings();

      case "getSignature":
        return { signature: await getSignature() };

      case "getTemplates":
        return await getTemplates();

      case "saveTemplates": {
        await saveTemplates(request.templates);
        return { success: true };
      }

      case "getHistory":
        return await getHistory();

      case "clearHistory": {
        await messenger.storage.local.set({ history: [] });
        return { success: true };
      }

      case "testConnection": {
        const url = request.url.replace(/\/+$/, "");
        const resp = await fetch(`${url}/api/tags`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return { models: (data.models || []).map((m) => m.name) };
      }

      case "getModels": {
        const settings = await getSettings();
        const resp = await fetch(`${settings.ollamaUrl}/api/tags`);
        if (!resp.ok) throw new Error("Ollamaに接続できません");
        const data = await resp.json();
        return (data.models || []).map((m) => m.name);
      }

      case "getBuildPrompt": {
        const threadMessages = request.threadMessages || [];
        const { systemPrompt, userPrompt } = buildPrompt(
          request.message,
          request.tone,
          request.language,
          request.templatePrompt,
          threadMessages
        );
        return { systemPrompt, userPrompt };
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }
  } catch (err) {
    return { error: err.message };
  }
});

// ==========================================
// Auto-Draft: Generate reply drafts for new incoming mail
// with streaming progress broadcast to monitor tabs
// ==========================================

const autoDraftQueue = [];
let autoDraftProcessing = false;
const monitorPorts = new Set();

// Handle monitor tab connections
messenger.runtime.onConnect.addListener((port) => {
  if (port.name === "ollama-stream") {
    handleStreamingPort(port);
  }
  if (port.name === "autodraft-monitor") {
    monitorPorts.add(port);
    port.onDisconnect.addListener(() => monitorPorts.delete(port));
    port.onMessage.addListener(async (msg) => {
      if (msg.action === "getState") {
        const settings = await getSettings();
        port.postMessage({ type: "settings", autoDraft: settings.autoDraft });
      }
    });
  }
});

function broadcastToMonitors(msg) {
  for (const port of monitorPorts) {
    try {
      port.postMessage(msg);
    } catch (e) {
      monitorPorts.delete(port);
    }
  }
}

async function getUserEmails() {
  const emails = new Set();
  try {
    const accounts = await messenger.accounts.list();
    for (const acct of accounts) {
      if (acct.identities) {
        for (const id of acct.identities) {
          if (id.email) emails.add(id.email.toLowerCase());
        }
      }
    }
  } catch (e) { /* ignore */ }
  return emails;
}

function isAddressedToUser(msg, userEmails) {
  const checkRecipients = (list) => {
    if (!list) return false;
    for (const addr of list) {
      const match = addr.match(/<([^>]+)>/);
      const email = (match ? match[1] : addr).toLowerCase().trim();
      if (userEmails.has(email)) return true;
    }
    return false;
  };
  return checkRecipients(msg.recipients) || checkRecipients(msg.ccList);
}

// Auto-draft with streaming and monitor broadcast
async function processAutoDraft(msgHeader) {
  const settings = await getSettings();
  const msgId = msgHeader.id;
  const startTime = Date.now();

  broadcastToMonitors({ type: "start", msgId });

  try {
    const full = await messenger.messages.getFull(msgHeader.id);
    const body = extractPlainText(full);

    const message = {
      id: msgHeader.id,
      subject: msgHeader.subject || "(no subject)",
      author: msgHeader.author || "",
      date: msgHeader.date
        ? new Date(msgHeader.date).toLocaleString("ja-JP")
        : "",
      body,
    };

    const { systemPrompt, userPrompt } = buildPrompt(
      message,
      settings.autoDraftTone,
      settings.autoDraftLanguage,
      "",
      []
    );

    // Streaming generation with broadcast
    const replyText = await new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${settings.ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: settings.model,
            stream: true,
            options: {
              temperature: settings.temperature,
              num_predict: settings.maxTokens,
            },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!response.ok) {
          reject(new Error(`HTTP ${response.status}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                fullText += json.message.content;
                broadcastToMonitors({
                  type: "chunk",
                  msgId,
                  text: json.message.content,
                });
              }
            } catch (e) { /* skip */ }
          }
        }
        resolve(fullText);
      } catch (e) {
        reject(e);
      }
    });

    if (!replyText) {
      broadcastToMonitors({
        type: "error",
        msgId,
        error: "空の返信が生成されました",
      });
      return;
    }

    // Open compose, prepend reply, save as draft, close
    const composeTab = await messenger.compose.beginReply(
      msgHeader.id,
      "replyToSender"
    );
    await new Promise((r) => setTimeout(r, 800));

    const details = await messenger.compose.getComposeDetails(composeTab.id);
    let fullReply = replyText;
    if (settings.autoSignature) {
      const sig = await getSignature();
      if (sig) fullReply += "\n\n-- \n" + sig;
    }

    if (details.isPlainText) {
      const existing = details.plainTextBody || "";
      await messenger.compose.setComposeDetails(composeTab.id, {
        plainTextBody: fullReply + "\n\n" + existing,
      });
    } else {
      const replyHtml = fullReply
        .split("\n")
        .map((l) => `<p>${l || "<br>"}</p>`)
        .join("");
      const existing = details.body || "";
      await messenger.compose.setComposeDetails(composeTab.id, {
        body: replyHtml + "<br>" + existing,
      });
    }

    await messenger.compose.saveMessage(composeTab.id, { mode: "draft" });
    await messenger.tabs.remove(composeTab.id);

    const elapsed = Date.now() - startTime;
    broadcastToMonitors({ type: "done", msgId, elapsed });

    await addHistory({
      subject: message.subject,
      author: message.author,
      tone: settings.autoDraftTone,
      language: settings.autoDraftLanguage,
      model: settings.model,
      reply: replyText,
      autoDraft: true,
    });

    console.log(
      `[Ollama Reply] Auto-draft saved: ${message.subject} (${(elapsed / 1000).toFixed(1)}s)`
    );
  } catch (err) {
    broadcastToMonitors({ type: "error", msgId, error: err.message });
    console.error(`[Ollama Reply] Auto-draft failed: ${err.message}`);
  }
}

async function processAutoDraftQueue() {
  if (autoDraftProcessing) return;
  autoDraftProcessing = true;

  while (autoDraftQueue.length > 0) {
    const msg = autoDraftQueue.shift();
    try {
      await processAutoDraft(msg);
    } catch (e) {
      console.error("[Ollama Reply] Queue error:", e.message);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  autoDraftProcessing = false;
}

messenger.messages.onNewMailReceived.addListener(async (folder, msgList) => {
  const settings = await getSettings();
  if (!settings.autoDraft) return;

  const userEmails = await getUserEmails();
  if (userEmails.size === 0) return;

  const messages = msgList.messages || [];
  for (const msg of messages) {
    if (isAddressedToUser(msg, userEmails)) {
      broadcastToMonitors({
        type: "queued",
        msgId: msg.id,
        subject: msg.subject || "(no subject)",
        from: msg.author || "",
      });
      autoDraftQueue.push(msg);
    }
  }

  processAutoDraftQueue();
});
