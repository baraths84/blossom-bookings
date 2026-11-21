"""Revision-bound reviews. Only this module decides a finding's disposition."""

import hashlib
import json
import re
import secrets
import sqlite3
import threading
from contextlib import contextmanager, nullcontext
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from urllib.parse import quote


class Unavailable(RuntimeError):
    """A safe operator-facing error, without credentials or raw service output."""


@dataclass(frozen=True)
class Revision:
    repo: str
    number: int
    sha: str
    title: str
    pr_url: str
    commit_url: str
    source_base: str
    change_summary: str = ""


@dataclass(frozen=True)
class Finding:
    rule: str
    path: str
    line: int
    message: str
    source_line: str = ""

    @property
    def fingerprint(self):
        location = json.dumps([self.rule, self.path, self.line, self.message], ensure_ascii=False)
        return hashlib.sha256(location.encode()).hexdigest()


SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    repo TEXT, pr INTEGER, sha TEXT, state TEXT, detail TEXT, scanned_at TEXT,
    PRIMARY KEY (repo, pr, sha)
);
CREATE TABLE IF NOT EXISTS saved_evidence (
    repo TEXT, pr INTEGER, sha TEXT, detail TEXT, scanned_at TEXT,
    PRIMARY KEY (repo, pr, sha)
);
CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY, repo TEXT, pr INTEGER, sha TEXT, fingerprint TEXT, issue TEXT,
    finding TEXT, UNIQUE (repo, pr, sha, fingerprint, issue)
);
CREATE TABLE IF NOT EXISTS receipts (
    request_id TEXT PRIMARY KEY REFERENCES requests(id), issue TEXT, comment_id TEXT,
    reviewer TEXT, expires TEXT, reason TEXT, recorded_at TEXT,
    UNIQUE (issue, comment_id)
);
"""


def utc_now():
    return datetime.now(timezone.utc)


class Store:
    def __init__(self, path):
        self.path = path
        with self.db() as db:
            db.executescript(SCHEMA)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def scan(self, rev):
        with self.db() as db:
            return db.execute("SELECT * FROM scans WHERE repo=? AND pr=? AND sha=?",
                              (rev.repo, rev.number, rev.sha)).fetchone()

    def save_scan(self, rev, state, detail, now):
        detail = json.dumps(detail)
        with self.db() as db:
            db.execute("INSERT OR REPLACE INTO scans VALUES (?,?,?,?,?,?)",
                       (rev.repo, rev.number, rev.sha, state, detail, now.isoformat()))
            if state == "ok":
                db.execute("INSERT OR REPLACE INTO saved_evidence VALUES (?,?,?,?,?)",
                           (rev.repo, rev.number, rev.sha, detail, now.isoformat()))

    def evidence(self, rev):
        with self.db() as db:
            return db.execute("SELECT * FROM saved_evidence WHERE repo=? AND pr=? AND sha=?",
                              (rev.repo, rev.number, rev.sha)).fetchone()

    def request(self, rev, finding, issue):
        keys = (rev.repo, rev.number, rev.sha, finding.fingerprint, issue)
        with self.db() as db:
            db.execute("INSERT OR IGNORE INTO requests VALUES (?,?,?,?,?,?,?)",
                       ("EX-" + secrets.token_hex(8).upper(), *keys, json.dumps(asdict(finding))))
            return db.execute("""SELECT id FROM requests WHERE repo=? AND pr=? AND sha=?
                                 AND fingerprint=? AND issue=?""", keys).fetchone()["id"]

    def record(self, request_id, issue, comment, reviewer, expiry, reason, now):
        with self.db() as db:
            db.execute("INSERT OR IGNORE INTO receipts VALUES (?,?,?,?,?,?,?)",
                       (request_id, issue, comment["id"], reviewer, expiry.isoformat(),
                        reason, now.isoformat()))

    def receipt(self, request_id):
        with self.db() as db:
            row = db.execute("SELECT * FROM receipts WHERE request_id=?", (request_id,)).fetchone()
            return dict(row) if row else None

    def previous(self, rev, issue):
        with self.db() as db:
            row = db.execute("""SELECT r.sha, a.* FROM receipts a JOIN requests r ON r.id=a.request_id
                WHERE r.repo=? AND r.pr=? AND r.sha!=? AND r.issue=?
                ORDER BY a.recorded_at DESC LIMIT 1""", (rev.repo, rev.number, rev.sha, issue)).fetchone()
            return dict(row) if row else None


APPROVAL = re.compile(r"APPROVE (EX-[0-9A-F]{16}) UNTIL (\d{4}-\d{2}-\d{2}) REASON ([^\r\n]{1,500})")


def collect_decision(store, request_id, jira, comments, now):
    verified = set()
    for comment in comments:
        match = APPROVAL.fullmatch(str(comment.get("body", "")).strip())
        if not match or match[1] != request_id or not comment.get("id"):
            continue
        if comment.get("updated") != comment.get("created") or not comment.get("created"):
            continue
        if jira.author_key(comment.get("author", {})) != jira.reviewer:
            continue
        try:
            expiry = date.fromisoformat(match[2])
            posted_at = datetime.fromisoformat(comment["created"])
            if posted_at.tzinfo is None:
                continue
            posted = posted_at.astimezone(timezone.utc).date()
        except (TypeError, ValueError):
            continue
        if expiry < posted or not match[3].strip():
            continue
        store.record(request_id, jira.scope, comment, jira.reviewer, expiry, match[3].strip(), now)
        verified.add(str(comment["id"]))
    return verified


class ReviewService:
    def __init__(self, store, github, scanner, jira, agents, clock=utc_now):
        self.store, self.github, self.scanner = store, github, scanner
        self.jira, self.agents, self.clock = jira, agents, clock
        self.lock = threading.RLock()

    def handle(self, action):
        # A rehearsal can replay prior evidence while a new scan is still running.
        with (nullcontext() if action == "replay" else self.lock):
            rev = self.github.head()
            if action == "review":
                try:
                    findings = self.scanner.scan(rev)
                    notes = self.agents.explain(rev, findings[0]) if findings else {}
                    detail = {"findings": [asdict(f) for f in findings], "notes": notes}
                    self.store.save_scan(rev, "ok", detail, self.clock())
                except Unavailable as exc:
                    self.store.save_scan(rev, "error", {"error": str(exc)}, self.clock())
                # The scan may have taken minutes. Never attach it to a newer head.
                rev = self.github.head()
            result = self.status(rev, publish=action == "review", replay=action == "replay")
            latest = self.github.head()
            if latest.sha != rev.sha:
                result = self.status(latest, publish=False, replay=action == "replay")
            return result

    def status(self, rev, publish, replay=False):
        previous = self.store.previous(rev, self.jira.scope)
        if previous:
            previous["commit_url"] = rev.commit_url.rsplit("/", 1)[0] + "/" + previous["sha"]
        result = {"revision": asdict(rev), "jira": self.jira.url, "previous": previous,
                  "receipt": None, "finding": None, "notes": {}, "request": None}
        scan = self.store.evidence(rev) if replay else self.store.scan(rev)
        if not scan:
            if replay:
                return dict(result, state="Replay unavailable", detail="No saved scan for this exact commit.")
            return dict(result, state="Needs review", detail="Run a review for this commit.")
        detail = json.loads(scan["detail"])
        if not replay and scan["state"] == "error":
            return dict(result, state="Scan unavailable", detail=detail["error"])
        result["evidence"] = f"{self.scanner.label} · {scan['scanned_at'][:19]} UTC"
        if not detail["findings"]:
            if replay:
                return dict(result, state="Evidence replay", detail="The saved scan reported zero findings.")
            return dict(result, state="No findings reported", detail="Snyk Code reported zero findings for this scan.")
        finding = Finding(**detail["findings"][0])
        request_id = self.store.request(rev, finding, self.jira.scope)
        source_url = f"{rev.source_base}/{quote(finding.path, safe='/')}#L{finding.line}"
        result.update(finding=asdict(finding), source_url=source_url, notes=detail["notes"],
                      request=request_id, count=len(detail["findings"]))
        if replay:
            return dict(result, state="Evidence replay", detail="Saved evidence from this commit. Ask for status to check the current decision.")
        try:
            comments = self.jira.comments()
            if publish:
                self.jira.ensure_request(request_id, rev, finding, source_url, comments)
            verified = collect_decision(self.store, request_id, self.jira, comments, self.clock())
        except Unavailable as exc:
            return dict(result, state="Jira unavailable", detail=str(exc))
        receipt = self.store.receipt(request_id)
        if receipt and receipt["comment_id"] not in verified:
            return dict(result, state="Needs review", detail="The original signed-in reviewer comment can no longer be verified in Jira.")
        result["receipt"] = receipt
        if receipt:
            if date.fromisoformat(receipt["expires"]) < self.clock().date():
                return dict(result, state="Expired", detail="The recorded exception has expired.")
            return dict(result, state="Exception approved", detail="The exception covers this finding at this commit.")
        state = "Needs review" if previous else "Pending"
        return dict(result, state=state, detail="Waiting for the designated Jira reviewer.")


def request_body(request_id, rev, finding, source_url):
    return (f"AppSec review request {request_id}\n{rev.repo} PR #{rev.number} · {rev.sha}\n"
            f"{finding.rule} · {finding.path}:{finding.line}\n{finding.message}\n{source_url}\n\n"
            f"Reviewer decision (replace the date and reason):\n"
            f"APPROVE {request_id} UNTIL YYYY-MM-DD REASON your rationale")
