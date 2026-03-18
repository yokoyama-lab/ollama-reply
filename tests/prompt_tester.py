#!/usr/bin/env python3
import json
import requests
import sys
import os

# Simplified version of background.js logic in Python for simulation
def build_prompt_sim(message, tone, language, template_prompt="", thread_messages=None):
    tone_map = {
        "polite": "丁寧・敬語を使った" if language == "ja" else "polite and formal",
        "casual": "カジュアルで親しみやすい" if language == "ja" else "casual and friendly",
        "business": "ビジネスライクで簡潔な" if language == "ja" else "professional and concise",
        "academic": "学術的で正確な" if language == "ja" else "academic and precise",
        "mirror": (
            "相手のメールの語彙、敬語のレベル、文体を分析し、それに完全に調和するスタイル" 
            if language == "ja" else 
            "Mirroring the sender's style exactly"
        )
    }

    tone_desc = tone_map.get(tone, tone_map["polite"])
    tone_instruction = (
        (f"返信は相手の文体をミラーリングして書いてください: {tone_desc}" if language == "ja" else f"Mirror the sender's tone: {tone_desc}")
        if tone == "mirror" else
        (f"{tone_desc}トーンで返信を書く" if language == "ja" else f"Write in a {tone_desc} tone")
    )

    lang_label = "English" if language == "en" else "日本語"

    system_prompt = (
        f"あなたはメール返信を書くアシスタントです。以下のルールに従ってください：\n"
        f"- {tone_instruction}\n"
        f"- 返信本文のみを出力する（件名や宛先や署名は不要）\n"
        f"- 適切な挨拶と結びを含める\n"
        f"- 元のメールの要点に적確に応答する\n"
        f"- 自然な{lang_label}で書く"
        if language == "ja" else
        f"You are an email reply assistant. Follow these rules:\n"
        f"- {tone_instruction}\n"
        f"- Output only the reply body (no subject, headers, or signature)\n"
        f"- Include appropriate greeting and closing\n"
        f"- Address the key points of the original email\n"
        f"- Write naturally in {lang_label}"
    )

    if template_prompt:
        system_prompt += f"\n\n追加指示: {template_prompt}"

    current_label = "返信対象のメール" if language == "ja" else "Email to reply to"
    user_prompt = (
        f"以下のメールへの返信を書いてください。\n"
        f"--- {current_label} ---\n"
        f"差出人: {message['author']}\n"
        f"件名: {message['subject']}\n"
        f"日時: {message['date']}\n\n"
        f"{message['body']}\n"
        f"--- ここまで ---\n\n"
        f"上記のメールに対する返信を書いてください。"
    )
    
    return system_prompt, user_prompt

def test_ollama_call(ollama_url, model, system_prompt, user_prompt):
    print(f"Connecting to {ollama_url} with model {model}...")
    try:
        response = requests.post(
            f"{ollama_url}/api/chat",
            json={
                "model": model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]
            },
            timeout=30
        )
        if response.status_code == 200:
            return response.json().get("message", {}).get("content", "")
        else:
            return f"Error: HTTP {response.status_code} - {response.text}"
    except Exception as e:
        return f"Error: {str(e)}"

def main():
    print("=== Ollama Reply Prompt Simulator ===")
    
    # Mock data
    mock_message = {
        "author": "田中 太郎 <tanaka@example.com>",
        "subject": "打ち合わせ日程のご相談",
        "date": "2026/03/17 10:00:00",
        "body": "お世話になっております。田中です。\n次回のプロジェクト進捗確認の打ち合わせですが、来週月曜日の14時はいかがでしょうか？\nご確認のほどよろしくお願いいたします。"
    }

    # Simulation parameters
    tone = "mirror"
    language = "ja"
    model = "gemma2:2b" # Change this to a model you have
    url = "http://localhost:11434"

    system, user = build_prompt_sim(mock_message, tone, language)

    print("\n--- SYSTEM PROMPT ---")
    print(system)
    print("\n--- USER PROMPT ---")
    print(user)

    if len(sys.argv) > 1 and sys.argv[1] == "--run":
        print("\n--- GENERATED REPLY ---")
        reply = test_ollama_call(url, model, system, user)
        print(reply)

if __name__ == "__main__":
    main()
