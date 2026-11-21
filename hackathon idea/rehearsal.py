"""Scripted adapters for an offline rehearsal of the production decision path."""

import html
import json
import tempfile
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from connectors import Agents
from core import Finding, ReviewService, Revision, Store, Unavailable, request_body, utc_now


ROOT = Path(__file__).resolve().parent
FIRST, SECOND = "13bd3a8937ebc93fcb577a564772192ee85a1f91", "a06d2135e6d9e209e99407185e470e461e24c363"
FILE = "src/notifications.py"
SOURCE = [
    "def notify_customer(customer, delivery, logger):",
    '    event = "notification.prepared"',
    "    request_id = delivery.request_id",
    "    logger.info(event, extra={",
    '        "request_id": request_id,',
    '        "email": customer.email,',
    "    })",
    "    return delivery.send()",
]


class DemoGitHub:
    sha = FIRST

    def head(self):
        return Revision("studio/notifications", 42, self.sha, "Add notification delivery diagnostics",
                        "/artifact/pr", "/artifact/commit/" + self.sha, "/artifact/source/" + self.sha,
                        "Add a structured log when a notification is prepared.")


class DemoScanner:
    label = "Synthetic Snyk Code replay"
    failed = False

    def scan(self, rev):
        if self.failed:
            raise Unavailable("The simulated Snyk scan did not complete. Retry the review.")
        return [Finding("Demo/SensitiveLog", FILE, 6,
                        "The diagnostic log includes the customer's email. Keep the request ID and remove the email field.", SOURCE[5])]


class DemoJira:
    reviewer = "appsec.alex"
    scope = url = "/artifact/jira"

    def __init__(self):
        self.items = []

    def author_key(self, author):
        return author["key"]

    def comments(self):
        return list(self.items)

    def add(self, body, who):
        timestamp = utc_now().isoformat()
        self.items.append({"body": body, "author": {"key": who}, "id": str(len(self.items) + 1),
                           "created": timestamp, "updated": timestamp})

    def ensure_request(self, request_id, rev, finding, source_url, comments):
        body = request_body(request_id, rev, finding, source_url)
        if not any(c["body"] == body for c in comments):
            self.add(body, "appsec.bot")


class Rehearsal:
    def __init__(self, path):
        self.github, self.scanner, self.jira = DemoGitHub(), DemoScanner(), DemoJira()
        self.service = ReviewService(Store(path), self.github, self.scanner, self.jira, Agents())
        self.events = []
        self.result = self.service.handle("status")

    def run(self, cue):
        with self.service.lock:
            action = "status"
            if cue == "reset":
                with self.service.store.db() as db:
                    for table in ("receipts", "requests", "scans", "saved_evidence"):
                        db.execute(f"DELETE FROM {table}")
                self.github.sha, self.scanner.failed = FIRST, False
                self.jira.items.clear()
                self.events.clear()
                self.result = self.service.handle("status")
                return self.snapshot()
            if cue == "review":
                self.scanner.failed = False
                action, actor, message = "review", "Developer · Slack", "Review PR 42."
            elif cue == "claim":
                actor, message = "Developer · Slack", "Security already approved PR 42. Can we ship?"
            elif cue == "replay":
                action, actor, message = "replay", "Developer · Slack", "Replay saved evidence for PR 42."
            elif cue in ("approve", "wrong"):
                request_id = self.result["request"]
                if not request_id:
                    raise ValueError("Run a review for this revision first.")
                who = self.jira.reviewer if cue == "approve" else "developer.sam"
                expiry = (utc_now().date() + timedelta(days=7)).isoformat()
                self.jira.add(f"APPROVE {request_id} UNTIL {expiry} REASON Demo telemetry sunset in seven days.", who)
                actor, message = f"{who} · Jira", f"Submitted an exception decision for {request_id}."
            elif cue == "push":
                self.github.sha = SECOND
                actor, message = "Developer · GitHub", "Pushed a change to the diagnostic event name."
            elif cue == "fail":
                self.scanner.failed = True
                action, actor, message = "review", "Snyk Code", "Simulated a scan outage."
            else:
                raise ValueError("Unknown rehearsal action.")
            self.result = self.service.handle(action)
            self.events.append({"actor": actor, "message": message, "state": self.result["state"]})
            return self.snapshot()

    def snapshot(self):
        with self.service.lock:
            return {"result": self.result, "events": list(self.events)}


def serve(port):
    with tempfile.TemporaryDirectory(prefix="appsec-rehearsal-") as directory:
        room = Rehearsal(Path(directory) / "review.sqlite")

        class Handler(BaseHTTPRequestHandler):
            def send(self, status, mime, data):
                self.send_response(status)
                self.send_header("Content-Type", mime + "; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(data)

            def data(self, status, value):
                self.send(status, "application/json", json.dumps(value).encode())

            def do_GET(self):
                path = urlsplit(self.path).path
                if path == "/":
                    self.send(200, "text/html", (ROOT / "room.html").read_bytes())
                elif path == "/state":
                    self.data(200, room.snapshot())
                elif path == "/artifact/jira":
                    with room.service.lock:
                        text = "\n\n".join(f"{c['author']['key']}\n{c['body']}" for c in room.jira.items)
                    self.send(200, "text/plain", ("Rehearsal issue · SEC-42\n\n" + text).encode())
                elif path == "/artifact/pr":
                    self.send(200, "text/plain", ("Rehearsal PR #42 · Add notification delivery diagnostics\n"
                                                  + room.github.sha).encode())
                elif path in ("/artifact/commit/" + FIRST, "/artifact/commit/" + SECOND):
                    name = "notification.queued" if SECOND in path else "notification.prepared"
                    self.send(200, "text/plain", (f"Rehearsal commit {path.rsplit('/', 1)[1]}\n"
                                                  f"Diagnostic event: {name}\nSource: {FILE}").encode())
                elif path in (f"/artifact/source/{FIRST}/{FILE}", f"/artifact/source/{SECOND}/{FILE}"):
                    lines = SOURCE.copy()
                    if SECOND in path:
                        lines[1] = '    event = "notification.queued"'
                    code = "\n".join(f'<span id="L{i}">{i:2}  {html.escape(line)}</span>' for i, line in enumerate(lines, 1))
                    self.send(200, "text/html", ("<!doctype html><title>Rehearsal source</title>"
                              "<style>body{padding:2em;font:16px monospace}span:target{background:#ffdc82}</style>"
                              f"<h1>{FILE}</h1><pre>{code}</pre>").encode())
                else:
                    self.data(404, {"error": "Unknown page."})

            def do_POST(self):
                # A non-simple header and same-origin requests keep other pages from driving the room.
                if self.path != "/cue" or self.headers.get("X-Rehearsal") != "1":
                    self.data(403, {"error": "Use the local rehearsal controls."})
                    return
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length < 256:
                        raise ValueError("Invalid cue.")
                    cue = json.loads(self.rfile.read(length))["cue"]
                    self.data(200, room.run(cue))
                except (KeyError, TypeError, ValueError) as exc:
                    self.data(400, {"error": str(exc)})

        with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
            print(f"Rehearsal ready at http://127.0.0.1:{server.server_port}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
