#!/usr/bin/env python3
import os
import zipfile
import json
import sys
import re

def check_code_quality(src_dir):
    """Scan source code for potential issues like innerHTML or hardcoded strings."""
    print("Checking code quality...")
    issues = 0
    
    # Pattern to find innerHTML usage
    inner_html_re = re.compile(r"\.innerHTML\s*=")
    
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith((".js", ".html")):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                    # Check for innerHTML
                    if inner_html_re.search(content):
                        print(f"  [WARNING] Possible unsafe innerHTML usage in: {path}")
                        issues += 1
                        
                    # Check for hardcoded Japanese characters in JS (as a hint for missing i18n)
                    if file.endswith(".js"):
                        if re.search(r"[\u3040-\u30ff\u4e00-\u9faf]", content):
                            # Ignore comments
                            lines = content.split("\n")
                            for i, line in enumerate(lines):
                                if "//" in line:
                                    line = line.split("//")[0]
                                if re.search(r"[\u3040-\u30ff\u4e00-\u9faf]", line):
                                    print(f"  [INFO] Hardcoded Japanese characters found in: {path}:{i+1}")
                                    # Not an error, but a reminder
    
    if issues > 0:
        print(f"Found {issues} potential quality issues.")
    else:
        print("No major code quality issues found.")
    return True # Continue build even with warnings for now

def validate_manifest(manifest_path):
    """Simple check for manifest existence and basic JSON structure."""
    if not os.path.exists(manifest_path):
        print(f"Error: {manifest_path} not found.")
        return False
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"Loaded manifest: {data.get('name')} v{data.get('version')}")
            return True
    except Exception as e:
        print(f"Error parsing manifest.json: {e}")
        return False

def package_xpi(source_dir, output_file):
    """Zip the contents of source_dir into output_file."""
    print(f"Packaging {source_dir} into {output_file}...")
    try:
        with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as xpi:
            for root, dirs, files in os.walk(source_dir):
                for file in files:
                    if file.startswith(".DS_Store"):
                        continue
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, source_dir)
                    xpi.write(full_path, rel_path)
        print(f"Successfully created {output_file} ({os.path.getsize(output_file)} bytes)")
        return True
    except Exception as e:
        print(f"Error during packaging: {e}")
        return False

def main():
    src_dir = "src"
    manifest_path = os.path.join(src_dir, "manifest.json")
    
    if not validate_manifest(manifest_path):
        sys.exit(1)

    # Perform quality check
    check_code_quality(src_dir)

    # Read version for filename
    with open(manifest_path, "r", encoding="utf-8") as f:
        version = json.load(f).get("version", "unknown")
    output_xpi = f"ollama-reply-{version}.xpi"

    if package_xpi(src_dir, output_xpi):
        print(f"\nBuild v{version} complete.")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
