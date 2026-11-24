#!/usr/bin/env python3
"""Check every lesson resource URL in data/patterns.json.

Usage: python3 tools/check_links.py
Exits 1 if any link is dead. LeetCode problem links are not checked:
LeetCode refuses automated requests, so they would always look broken.
"""

import json
import pathlib
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
HEADERS = {"User-Agent": "Mozilla/5.0 (link-check; pattern-drill)", "Accept": "text/html,*/*"}


def collect():
    data = json.loads((ROOT / "data" / "patterns.json").read_text())
    urls = {}
    for p in data["patterns"]:
        for r in p.get("resources", []):
            urls.setdefault(r["url"], []).append(p["id"])
    return urls


def check(url):
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as res:
                return url, res.status, None
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 501):
                continue  # some sites reject HEAD; retry with GET
            return url, e.code, None
        except Exception as e:  # noqa: BLE001 - report any network failure
            if method == "HEAD":
                continue
            return url, None, str(e)
    return url, None, "no response"


def main():
    urls = collect()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, urls))
    dead = []
    for url, status, err in sorted(results, key=lambda r: r[0]):
        ok = status is not None and 200 <= status < 400
        print(f"{'ok  ' if ok else 'DEAD'} {status or err:>5}  {url}  ({', '.join(urls[url])})")
        if not ok:
            dead.append(url)
    print(f"\n{len(urls) - len(dead)}/{len(urls)} links ok")
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
