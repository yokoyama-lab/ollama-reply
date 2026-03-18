#!/usr/bin/env python3
import sys
import os
import re
from collections import Counter

def analyze_emails(file_path):
    """Analyze a text file of sent emails to extract style features."""
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found.")
        return None

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Simple heuristic to find greetings and closings
    greetings = re.findall(r"^(.*?様|.*?様、|.*?様。|お世話になっております。|.*?さん、)", content, re.MULTILINE)
    closings = re.findall(r"(よろしくお願いいたします。|宜しくお願い致します。|失礼いたします。|.*?拝)$", content, re.MULTILINE)
    
    # Common transition phrases
    transitions = re.findall(r"(さて、|つきましては、|ところで、|なお、)", content)

    style_profile = {
        "greetings": Counter(greetings).most_common(3),
        "closings": Counter(closings).most_common(3),
        "transitions": Counter(transitions).most_common(3),
        "sentence_endings": "ですます調" if "です。" in content or "ます。" in content else "である調"
    }
    
    return style_profile

def generate_profile_snippet(profile):
    if not profile:
        return ""
    
    snippet = "ユーザーの執筆スタイル分析結果:\n"
    snippet += f"- 基本文体: {profile['sentence_endings']}\n"
    if profile['greetings']:
        snippet += f"- よく使う挨拶: {', '.join([g[0] for g in profile['greetings']])}\n"
    if profile['closings']:
        snippet += f"- よく使う結び: {', '.join([c[0] for c in profile['closings']])}\n"
    
    return snippet

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_style.py <path_to_sent_emails.txt>")
        print("Tip: Export some of your sent emails to a text file first.")
        return

    profile = analyze_emails(sys.argv[1])
    if profile:
        print("=== 個人文体プロファイル生成完了 ===")
        snippet = generate_profile_snippet(profile)
        print(snippet)
        print("\nこの内容を『テンプレート設定』のシステムプロンプト等に貼り付けることで、AIがよりあなたらしい文章を書くようになります。")

if __name__ == "__main__":
    main()
