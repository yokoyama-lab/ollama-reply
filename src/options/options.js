// options.js — Ollama Reply v3.0.0 settings

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await messenger.runtime.sendMessage({ action: "getSettings" });

  $("#ollamaUrl").value = settings.ollamaUrl || "http://localhost:11434";
  $("#model").value = settings.model || "gemma3:4b";
  $("#temperature").value = settings.temperature ?? 0.7;
  $("#maxTokens").value = settings.maxTokens ?? 1024;
  $("#threadContext").checked = settings.threadContext !== false;
  $("#threadDepth").value = settings.threadDepth ?? 3;
  $("#autoSignature").checked = settings.autoSignature !== false;
  $("#autoDraft").checked = settings.autoDraft === true;
  $("#autoDraftTone").value = settings.autoDraftTone || "polite";
  $("#autoDraftLanguage").value = settings.autoDraftLanguage || "ja";

  // Save
  $("#btn-save").addEventListener("click", async () => {
    const newSettings = {
      ollamaUrl: $("#ollamaUrl").value.replace(/\/+$/, ""),
      model: $("#model").value.trim(),
      temperature: parseFloat($("#temperature").value) || 0.7,
      maxTokens: parseInt($("#maxTokens").value) || 1024,
      threadContext: $("#threadContext").checked,
      threadDepth: parseInt($("#threadDepth").value) || 3,
      autoSignature: $("#autoSignature").checked,
      autoDraft: $("#autoDraft").checked,
      autoDraftTone: $("#autoDraftTone").value,
      autoDraftLanguage: $("#autoDraftLanguage").value,
    };
    await messenger.storage.local.set({ settings: newSettings });
    const msg = $("#saved-msg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 2000);
  });

  // Test connection (via background)
  $("#btn-test").addEventListener("click", async () => {
    const result = $("#test-result");
    result.textContent = "接続テスト中...";
    result.style.color = "#555";
    try {
      const url = $("#ollamaUrl").value.replace(/\/+$/, "");
      const res = await messenger.runtime.sendMessage({ action: "testConnection", url });
      if (res.error) {
        result.textContent = `❌ ${res.error}`;
        result.style.color = "#c00";
        return;
      }
      result.textContent = `✅ 接続成功！ ${res.models.length} モデル利用可能`;
      result.style.color = "#0a0";
    } catch (err) {
      result.textContent = `❌ 接続失敗: ${err.message}`;
      result.style.color = "#c00";
    }
  });

  // Fetch models (via background)
  $("#btn-fetch-models").addEventListener("click", async () => {
    const list = $("#model-list");
    list.textContent = "取得中...";
    try {
      const url = $("#ollamaUrl").value.replace(/\/+$/, "");
      const res = await messenger.runtime.sendMessage({ action: "testConnection", url });
      if (res.error) { list.textContent = `エラー: ${res.error}`; return; }
      if (res.models.length === 0) { list.textContent = "モデルが見つかりません"; return; }
      list.textContent = `利用可能: ${res.models.join(", ")}`;
    } catch (err) {
      list.textContent = `エラー: ${err.message}`;
    }
  });
});
