# Ollama Reply

A Thunderbird extension that generates email replies using a locally running [Ollama](https://ollama.ai) LLM server.

## Features

- Generate AI-powered email replies directly in Thunderbird
- Streaming reply generation with real-time preview
- Multiple tone options: polite, business, casual, academic
- Japanese and English reply generation
- Thread context awareness (traverses reply chains)
- Customizable prompt templates (meeting scheduling, paper review, student communication, etc.)
- Auto-draft mode: automatically generates reply drafts for incoming mail
- Auto-draft monitor with real-time streaming output
- Generation history (last 50 entries)
- Automatic signature insertion

## Requirements

- Thunderbird 128.0 or later
- [Ollama](https://ollama.ai) running locally (default: `http://localhost:11434`)

## Installation

Download the `.xpi` file from the [Releases](../../releases) page and install it via Thunderbird's Add-ons Manager (Install Add-on From File).

## Usage

1. Go to **Settings → Ollama Reply** and set your Ollama server URL and default model.
2. Select an email in Thunderbird.
3. Click the **AI返信を生成** button in the message toolbar, or press **Ctrl+Shift+R**.
4. Choose tone, language, template, and number of candidates, then click **返信を生成**.
5. Edit the generated reply and click **返信** to open the compose window.

### Auto-draft mode

Enable **自動下書き生成** in settings to automatically generate draft replies for incoming mail addressed to you. Monitor progress via the **Ollama Reply モニター** toolbar button.

### Remote Ollama server

Use SSH port forwarding to connect to a remote Ollama server:

```bash
ssh -N -L 11434:localhost:11434 your-server
```

Then set the Ollama URL to `http://localhost:11434`.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Ollama URL | `http://localhost:11434` | Ollama server endpoint |
| Model | `gemma3:4b` | Default model |
| Temperature | `0.7` | Generation randomness |
| Max tokens | `1024` | Maximum reply length |
| Thread depth | `3` | Number of past messages to include as context |
| Auto signature | on | Append Thunderbird account signature |
| Auto draft | off | Automatically generate drafts for incoming mail |

## License

MIT
