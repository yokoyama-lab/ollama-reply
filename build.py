#!/usr/bin/env python3
import os
import zipfile
import json
import sys

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
                    # Skip system files or artifacts if any
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
    
    # Read version from manifest for filename
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            version = json.load(f).get("version", "unknown")
    except:
        version = "unknown"
        
    output_xpi = f"ollama-reply-{version}.xpi"

    if not validate_manifest(manifest_path):
        sys.exit(1)

    if package_xpi(src_dir, output_xpi):
        print("\nBuild complete. You can now upload the .xpi to Thunderbird Add-ons.")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
