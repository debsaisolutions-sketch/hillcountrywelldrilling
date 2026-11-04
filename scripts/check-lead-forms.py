#!/usr/bin/env python3
"""Fail the build if lead forms regress to Formspree placeholders or 555 numbers,
or if a page references a local asset that is not in the repo.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN_EXTS = {".html", ".js", ".css", ".txt", ".xml", ".json", ".md", ".svg"}
SKIP_DIRS = {".git", "node_modules", ".vercel", ".github"}
# This file contains the search tokens on purpose.
SKIP_FILES = {os.path.normpath(os.path.join(ROOT, "scripts", "check-lead-forms.py"))}

FORBIDDEN = ("formspree", "YOUR_FORM_ID", "REPLACE_WITH")
PLACEHOLDER_PHONE = re.compile(r"555-")
ATTR_RE = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", re.I)
FORM_RE = re.compile(r"<form\b", re.I)


def iter_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            path = os.path.normpath(os.path.join(dirpath, name))
            if path in SKIP_FILES:
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in SCAN_EXTS:
                yield path


def is_external(url):
    lower = url.lower()
    if lower.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return True
    if lower.startswith("//"):
        return True
    if re.match(r"^[a-z][a-z0-9+.-]*:", lower):
        return True
    return False


def local_target(html_path, url):
    clean = url.split("#", 1)[0].split("?", 1)[0].strip()
    if clean in ("", "/"):
        return os.path.join(ROOT, "index.html")
    if clean.startswith("/"):
        rel = clean.lstrip("/")
        return os.path.normpath(os.path.join(ROOT, rel))
    return os.path.normpath(os.path.join(os.path.dirname(html_path), clean))


def main():
    errors = []
    for path in iter_files():
        rel = os.path.relpath(path, ROOT)
        text = open(path, encoding="utf-8", errors="replace").read()
        lower = text.lower()
        for token in FORBIDDEN:
            if token.lower() in lower:
                errors.append(f"{rel}: found forbidden token {token}")
        if PLACEHOLDER_PHONE.search(text):
            errors.append(f"{rel}: found 555- placeholder number")

        if path.endswith(".html"):
            if FORM_RE.search(text):
                if "js/tdp-leads.js" not in text:
                    errors.append(f"{rel}: form page is missing /js/tdp-leads.js")
                if 'name="company_website"' not in text:
                    errors.append(f"{rel}: form page is missing the company_website honeypot")
            for match in ATTR_RE.finditer(text):
                url = match.group(1).strip()
                if is_external(url):
                    continue
                target = local_target(path, url)
                root = os.path.normpath(ROOT)
                if os.path.normpath(target) != root and not os.path.normpath(target).startswith(root + os.sep):
                    errors.append(f"{rel}: asset path escapes the repo ({url})")
                    continue
                if not os.path.isfile(target):
                    errors.append(f"{rel}: missing local asset {url}")

    if errors:
        print("Lead form check failed:")
        for err in errors:
            print(" -", err)
        return 1
    print("Lead form check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
