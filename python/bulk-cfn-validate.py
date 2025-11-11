#!/usr/bin/env python3
"""
Bulk CloudFormation template validator.

- Finds *.yml, *.yaml, *.json files recursively from current directory.
- Uses AWS CloudFormation validate_template for each file (requires AWS creds).
- Produces `cfn-validate-report.json` with per-file results.
- Exits with code 1 if any template is invalid.

Requires: boto3 (pip install boto3)
Run: python3 validate_cfn_templates.py
"""
import os
import sys
import json
import glob
import boto3
import botocore

MAX_TEMPLATE_BYTES = 51200  # avoid TemplateBody size limits (approx)
OUTFILE = "cfn-validate-report.json"

def find_templates():
    patterns = ["**/*.yml", "**/*.yaml", "**/*.json"]
    files = []
    for p in patterns:
        files.extend(glob.glob(p, recursive=True))
    # dedupe and sort
    return sorted(set(files))

def read_file(path):
    with open(path, "rb") as f:
        data = f.read()
    return data

def summarize_params(params):
    out = []
    for p in params or []:
        key = p.get("ParameterKey") or p.get("ParameterName") or "<unknown>"
        default = p.get("DefaultValue")
        out.append({"ParameterKey": key, "DefaultValue": default})
    return out

def main():
    client = boto3.client("cloudformation")
    files = find_templates()
    if not files:
        print("No CloudFormation templates found in current directory.")
        return 0

    report = []
    any_invalid = False

    for path in files:
        entry = {"file": path, "status": None, "error": None, "parameters": []}
        try:
            data = read_file(path)
        except Exception as e:
            entry["status"] = "error"
            entry["error"] = f"read_error: {str(e)}"
            report.append(entry)
            any_invalid = True
            print(f"[ERROR] {path}: unable to read file: {e}")
            continue

        size = len(data)
        if size > MAX_TEMPLATE_BYTES:
            entry["status"] = "skipped"
            entry["error"] = f"template_too_large ({size} bytes). Use TemplateURL or split template."
            report.append(entry)
            print(f"[SKIP] {path}: template size {size} bytes exceeds limit; skipped")
            continue

        try:
            body = data.decode("utf-8")
        except UnicodeDecodeError:
            entry["status"] = "error"
            entry["error"] = "unable_to_decode_as_utf8"
            report.append(entry)
            any_invalid = True
            print(f"[ERROR] {path}: not valid UTF-8")
            continue

        try:
            resp = client.validate_template(TemplateBody=body)
            entry["status"] = "valid"
            entry["parameters"] = summarize_params(resp.get("Parameters"))
            print(f"[OK]   {path}: valid, parameters={len(entry['parameters'])}")
        except botocore.exceptions.ClientError as e:
            entry["status"] = "invalid"
            # Extract AWS error message if present
            msg = e.response.get("Error", {}).get("Message")
            entry["error"] = msg or str(e)
            report.append(entry)
            any_invalid = True
            print(f"[FAIL] {path}: {entry['error']}")
        except Exception as e:
            entry["status"] = "error"
            entry["error"] = str(e)
            report.append(entry)
            any_invalid = True
            print(f"[ERROR] {path}: unexpected error: {e}")
        else:
            report.append(entry)

    # write report
    try:
        with open(OUTFILE, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\nReport written to ./{OUTFILE}")
    except Exception as e:
        print(f"Failed to write report: {e}")
        return 2

    return 1 if any_invalid else 0

if __name__ == "__main__":
    sys.exit(main())
