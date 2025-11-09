#!/usr/bin/env python3
"""
Resilient API Fetch with Exponential Backoff

Usage:
  python fetch_with_backoff.py --url https://httpbin.org/get --out response.json
  python fetch_with_backoff.py --url https://api.github.com --out github.json -H "Accept: application/vnd.github.v3+json"
Options:
  --url URL (default: https://httpbin.org/get)
  --out FILE (default: response.json)
  --retries N (default: 5)
  --headers -H format: Key:Value (repeatable)
  --base-wait SECONDS (default: 1.0)
  --max-wait SECONDS (default: 16.0)
"""
import argparse
import random
import time
import sys
import urllib.request
import urllib.error

def parse_headers(header_list):
    headers = {}
    for h in header_list or []:
        if ':' in h:
            k, v = h.split(':', 1)
            headers[k.strip()] = v.strip()
        else:
            print(f"Warning: header '{h}' is not in Key:Value format and will be ignored.", file=sys.stderr)
    return headers

def fetch_with_backoff(url, out_path, headers=None, retries=5, base_wait=1.0, max_wait=16.0, timeout=15.0):
    attempt = 0
    while True:
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = getattr(resp, 'status', None)
                if status is None:
                    status = resp.getcode()
                if 200 <= status < 300:
                    data = resp.read()
                    with open(out_path, 'wb') as f:
                        f.write(data)
                    print(f"Success: {status} - wrote {len(data)} bytes to {out_path}")
                    return True
                else:
                    raise urllib.error.HTTPError(url, status, "HTTP error", resp.headers, None)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            if attempt >= retries:
                print(f"Error: {e}. Exhausted {retries} retries.", file=sys.stderr)
                return False
            delay = min(max_wait, base_wait * (2 ** attempt))
            jitter = random.uniform(-0.25*delay, 0.25*delay)
            sleep_time = max(0.0, delay + jitter)
            print(f"Attempt {attempt+1} failed: {e}. Retrying in {sleep_time:.2f}s...", file=sys.stderr)
            time.sleep(sleep_time)
            attempt += 1

def main():
    parser = argparse.ArgumentParser(description="Fetch a URL with exponential backoff and save response to a file.")
    parser.add_argument('--url', default='https://httpbin.org/get', help='URL to fetch')
    parser.add_argument('--out', default='response.json', help='Output file path')
    parser.add_argument('--retries', type=int, default=5, help='Number of retry attempts')
    parser.add_argument('--base-wait', type=float, default=1.0, help='Base wait seconds for backoff')
    parser.add_argument('--max-wait', type=float, default=16.0, help='Maximum wait seconds for backoff')
    parser.add_argument('-H', '--headers', action='append', dest='headers', default=[], help='Additional header in Key:Value format. Can be specified multiple times.')
    args = parser.parse_args()

    hdrs = parse_headers(args.headers)
    success = fetch_with_backoff(
        url=args.url,
        out_path=args.out,
        headers=hdrs,
        retries=args.retries,
        base_wait=args.base_wait,
        max_wait=args.max_wait
    )
    if not success:
        sys.exit(1)

if __name__ == '__main__':
    main()
