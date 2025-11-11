#!/usr/bin/env bash
# tf-scan.sh - Scan repo for Terraform modules, fmt/init/validate/plan, then summarize.
# Usage: save as tf-scan.sh, chmod +x tf-scan.sh, run from repo root: ./tf-scan.sh
set -uo pipefail
IFS=$'\n\t'

# Requirements: terraform (required), jq (optional, for accurate plan change counts)
if ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: terraform not found in PATH. Install Terraform and retry." >&2
  exit 1
fi
JQ=0
if command -v jq >/dev/null 2>&1; then JQ=1; fi

# Gather directories that contain .tf files (exclude .terraform folders)
mapfile -t DIRS < <(find . -type f -name "*.tf" -not -path "./.terraform/*" -printf '%h\n' | sort -u)

if [ ${#DIRS[@]} -eq 0 ]; then
  echo "No Terraform files found in this repository."
  exit 0
fi

echo "Found ${#DIRS[@]} Terraform module directories."
echo

declare -A VALID_STATUS
declare -A PLAN_CHANGES

for d in "${DIRS[@]}"; do
  echo "---- [$d] ----"
  pushd "$d" >/dev/null || { echo "Skipping $d (cannot enter dir)"; continue; }
  start_time=$(date +%s)

  # Normalize formatting
  if terraform fmt -recursive >/dev/null 2>&1; then
    echo "fmt: OK"
  else
    echo "fmt: FAILED"
  fi

  # Init without remote backend to avoid requiring remote state
  if terraform init -backend=false -input=false >/dev/null 2>&1; then
    echo "init: OK (backend disabled)"
  else
    echo "init: Issues (backend disabled) - continuing"
  fi

  # Validate
  if terraform validate >/dev/null 2>&1; then
    echo "validate: OK"
    VALID_STATUS["$d"]="OK"
  else
    echo "validate: FAILED"
    VALID_STATUS["$d"]="FAIL"
  fi

  # Plan (saved to plan.out). Use -input=false to avoid prompts.
  terraform plan -input=false -no-color -out=plan.out >/dev/null 2>&1
  plan_rc=$?
  if [ $plan_rc -eq 0 ] && [ -f plan.out ]; then
    echo "plan: OK (plan.out saved)"
    if [ "$JQ" -eq 1 ]; then
      # Use terraform show -json and jq to count resource_changes
      changes=$(terraform show -json plan.out | jq '.resource_changes | length' 2>/dev/null || echo "0")
    else
      # Fallback note when jq is not available
      changes="(install jq for counts)"
    fi
  else
    echo "plan: FAILED (exit code $plan_rc)"
    changes="plan failed"
  fi

  end_time=$(date +%s)
  elapsed=$((end_time - start_time))
  PLAN_CHANGES["$d"]="$changes"
  rm -f plan.out
  popd >/dev/null
  echo "time: ${elapsed}s"
  echo
done

# Summary
echo "Summary:"
printf "%-60s %-8s %s\n" "module" "validate" "changes"
for d in "${DIRS[@]}"; do
  val=${VALID_STATUS["$d"]:-"SKIP"}
  changes=${PLAN_CHANGES["$d"]:-"-"}
  printf "%-60s %-8s %s\n" "$d" "$val" "$changes"
done

exit 0
