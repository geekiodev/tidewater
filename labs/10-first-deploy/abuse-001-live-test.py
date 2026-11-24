#!/usr/bin/env python3
"""
Lab 10, ABUSE-001 on the live app: do spoofed client-IP headers change the
login rate-limit bucket?

Phase 1 sends login attempts from this machine, each for a different
made-up @example.com address (so the per-email limit of 8 never applies),
until the per-IP limit (20 per 15 minutes) refuses one.
Phase 2 keeps going with a new forged X-Forwarded-For, X-Real-IP and
x-vercel-forwarded-for on every request. If the app trusted any of them,
each request would land in a fresh bucket and be let through.

No account is involved: the addresses don't exist and the password is a
fixed dummy string. After phase 1 this machine's IP is locked out of
logging in for 15 minutes.

Usage:
  python3 -I labs/10-first-deploy/abuse-001-live-test.py https://tidewater-bice.vercel.app evidence/lab-10/abuse-001-live.txt
  python3 -I labs/10-first-deploy/abuse-001-live-test.py https://tidewater-bice.vercel.app --dry-run
"""
import random
import sys
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser

TOO_MANY = "Too many attempts"
WRONG = "Email or password is incorrect"
DUMMY_PASSWORD = "lab10-dummy-not-a-password"  # no account uses it; the addresses don't exist
RUN = uuid.uuid4().hex[:6]


class HiddenInputs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "input" and a.get("type") == "hidden" and a.get("name", "").startswith("$ACTION"):
            self.fields.append((a["name"], a.get("value") or ""))


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def form_fields(base):
    with urllib.request.urlopen(f"{base}/login") as r:
        p = HiddenInputs()
        p.feed(r.read().decode())
    return p.fields


def multipart(fields):
    boundary = "----lab10" + uuid.uuid4().hex
    parts = []
    for name, value in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n')
    parts.append(f"--{boundary}--\r\n")
    return "".join(parts).encode(), f"multipart/form-data; boundary={boundary}"


def attempt(base, hidden, n, spoof):
    email = f"lab10-abuse-{RUN}-{n}@example.com"
    body, ctype = multipart(hidden + [("email", email), ("password", DUMMY_PASSWORD)])
    headers = {"Content-Type": ctype, "Origin": base, "User-Agent": "tidewater-lab10-abuse-test"}
    if spoof:
        headers["X-Forwarded-For"] = spoof
        headers["X-Real-IP"] = spoof
        headers["x-vercel-forwarded-for"] = spoof
    req = urllib.request.Request(f"{base}/login", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            status, text = r.status, r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode(errors="replace")
    result = "LIMITED" if TOO_MANY in text else "allowed (wrong password)" if WRONG in text else "other"
    return status, result


def main():
    base = sys.argv[1].rstrip("/")
    hidden = form_fields(base)
    if "--dry-run" in sys.argv:
        print(f"form fields found: {[n for n, _ in hidden]}; nothing sent")
        return
    out = open(sys.argv[2], "w")

    def log(line):
        print(line)
        out.write(line + "\n")
        out.flush()

    log(f"# ABUSE-001 live test against {base}, run {RUN}, started {now()}")
    log("# Each attempt: a different non-existent @example.com address and a fixed dummy password.")
    log("## Phase 1: no forged headers, until the per-IP limit (20 per 15 minutes) refuses an attempt")
    n = 0
    for _ in range(25):
        n += 1
        status, result = attempt(base, hidden, n, None)
        log(f"{now()}  #{n:02d}  forged IP: none            HTTP {status}  {result}")
        if result == "LIMITED":
            break
        time.sleep(0.5)
    else:
        log("Per-IP limit never applied in phase 1: stopping, nothing to compare against")
        return
    log("## Phase 2: a new forged X-Forwarded-For, X-Real-IP and x-vercel-forwarded-for on every attempt")
    limited = 0
    for _ in range(10):
        n += 1
        spoof = f"198.51.100.{random.randint(1, 254)}, 203.0.113.{random.randint(1, 254)}"
        status, result = attempt(base, hidden, n, spoof)
        limited += result == "LIMITED"
        log(f"{now()}  #{n:02d}  forged IP: {spoof:<28}  HTTP {status}  {result}")
        time.sleep(0.5)
    log(f"## Result: {limited} of 10 forged-header attempts were still limited "
        f"({'spoofing does NOT change the bucket' if limited == 10 else 'SPOOFING CHANGED THE BUCKET'}), finished {now()}")


if __name__ == "__main__":
    main()
