# Ollama Reply

[![GitHub license](https://img.shields.io/github/license/yokoyama-lab/ollama-reply)](https://github.com/yokoyama-lab/ollama-reply/blob/main/LICENSE)
[![Thunderbird Version](https://img.shields.io/badge/Thunderbird-128%2B-blue)](https://addons.thunderbird.net/)

**Ollama Reply** is a privacy-first Thunderbird extension that generates AI-powered email responses using a local or remote [Ollama](https://ollama.ai) LLM (Large Language Model) server.

---

### 🌐 [日本語 (Japanese)](#日本語概要)

---

## Key Features

- **Privacy-Centric AI:** All processing happens on your own hardware. Sensitive email content is never sent to third-party cloud AI services like OpenAI or Google.
- **Style Mirroring:** Automatically analyzes the sender's tone (formal, casual, etc.) and generates a matching response.
- **Iterative Refinement:** Refine AI drafts with quick action buttons ("Shorter", "More formal", etc.) or custom instructions.
- **Markdown Preview:** Real-time rendering of AI-generated Markdown into beautiful HTML for final review.
- **Context-Aware:** Traverses email threads to understand the conversation history for more accurate replies.
- **Auto-Draft Mode:** Monitors incoming mail and proactively creates reply drafts in the background.
- **Personal Style Analysis:** Includes a Python tool to analyze your past emails and adapt the AI to your unique writing style.

## Requirements

- **Thunderbird 128.0 (Supernova/Nebula)** or later.
- **Ollama** running locally or on a remote server (default: `http://localhost:11434`).

## Installation

1. Download the `.xpi` file from the [Releases](../../releases) page.
2. Open Thunderbird, go to **Settings → Extensions & Themes**.
3. Click the gear icon and select **Install Add-on From File...**.
4. Select the downloaded `.xpi` file.

## Developer & Advanced Usage

### Python Build System
This project uses **Python** for packaging and quality checks to avoid dependencies like Node.js.

```bash
# Build the .xpi package
./build.py
```

### Style Analysis Tool
Analyze your own sent emails to create a "Personal Style Profile" for the AI.

```bash
# Analyze your sent emails
python3 tools/analyze_style.py path_to_sent_emails.txt
```

---

## 日本語概要

**Ollama Reply** は、プライバシーを最優先に設計された Thunderbird 用の拡張機能です。ローカルまたはリモートで動作する **Ollama** を活用し、AI による高度なメール返信文の生成を支援します。

### 主な機能

- **圧倒的なプライバシー保護:** すべての AI 処理は自身のハードウェア上で行われます。機密性の高いメール内容が外部のクラウド AI サービスに送信されることはありません。
- **文体適応 (Mirroring):** 相手の語彙や敬語のレベルを自動分析し、最適なトーンで返信案を作成します。
- **クイックアクション修正:** 「短くして」「より丁寧に」といったボタン一つで、AI が生成した文章を即座にブラッシュアップできます。
- **Markdown プレビュー:** AI が生成した箇条書きや強調などの Markdown 形式を、送信前に美しく整形して確認できます。
- **スレッド文脈の把握:** メールのやり取り（スレッド）を自動的に遡り、過去の文脈を理解した上で的確な返信案を提示します。
- **自分流スタイルの学習:** 過去の送信メールを Python スクリプトで分析し、自分らしい書き癖を AI に反映させることが可能です。

### 開発・パッケージング
本プロジェクトは **Node.js 等を一切使用せず、Python のみでビルド・品質チェックを完結**させています。

```bash
# 提出用 .xpi ファイルの生成
./build.py
```

---

## License

This project is licensed under the [MIT License](LICENSE).

---
© 2026 [yokoyama-lab](https://github.com/yokoyama-lab)
