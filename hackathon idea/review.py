"""Run a local rehearsal or the live sandbox Slack assistant."""

import argparse
import hashlib
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

from connectors import Agents, GitHub, Jira, SnykCode
from core import ReviewService, Store, Unavailable


ROOT = Path(__file__).resolve().parent


def get_config():
    required = ("GITHUB_REPO", "PR_NUMBER", "GITHUB_TOKEN", "GIT_CHECKOUT", "SNYK_ORG",
                "JIRA_URL", "JIRA_ISSUE", "JIRA_TOKEN", "JIRA_REVIEWER_KEY", "SLACK_APP_TOKEN",
                "SLACK_BOT_TOKEN", "SLACK_CHANNEL")
    missing = [key for key in required if not os.getenv(key, "").strip()]
    if missing:
        raise SystemExit("Missing live configuration: " + ", ".join(missing))
    config = {key: os.environ[key].strip() for key in required}
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", config["GITHUB_REPO"]) or not re.fullmatch(r"[1-9]\d*", config["PR_NUMBER"]):
        raise SystemExit("Set GITHUB_REPO to owner/repo and PR_NUMBER to a positive integer.")
    jira = urlsplit(config["JIRA_URL"])
    if jira.scheme != "https" or not jira.hostname or jira.username or jira.password or jira.query or jira.fragment:
        raise SystemExit("Set JIRA_URL to the HTTPS base URL of the on-prem Jira instance.")
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*-\d+", config["JIRA_ISSUE"]):
        raise SystemExit("JIRA_ISSUE must identify an existing sandbox issue.")
    return config


def choose_action(text, number):
    text = re.sub(r"<@[A-Z0-9]+>", "", text).strip()
    mentions = re.findall(r"\bPR\s*#?\s*(\d+)\b", text, re.I)
    if mentions != [str(number)]:
        return None
    # Ordinary conversation can request a status read. Only an explicit review runs a scan.
    if re.fullmatch(rf"review\s+PR\s*#?\s*{number}[.!]?", text, re.I):
        return "review"
    if re.fullmatch(rf"replay\s+PR\s*#?\s*{number}[.!]?", text, re.I):
        return "replay"
    return "status"


def response_text(result):
    rev = result["revision"]
    lines = [f"{result['state']} · PR #{rev['number']} · {rev['sha'][:12]}", result["detail"]]
    finding = result.get("finding")
    if finding:
        lines.extend([f"Finding: {finding['rule']} at {finding['path']}:{finding['line']}",
                      f"{result['notes']['mode']} · Developer: {result['notes']['developer']}",
                      f"AppSec: {result['notes']['appsec']}",
                      f"Scope: one of {result['count']} reported findings. Request {result['request']}."])
    if result.get("evidence"):
        lines.append("Evidence: " + result["evidence"])
    if result["receipt"]:
        receipt = result["receipt"]
        lines.append(f"Jira reviewer {receipt['reviewer']} · valid through {receipt['expires']} UTC · {receipt['reason']}")
    if result["previous"]:
        previous = result["previous"]
        lines.append(f"Earlier exception {previous['request_id']} covers commit {previous['sha'][:12]}.")
    return "\n".join(lines)


def slack_listener(service, channel, number):
    def mention(event, client):
        if event.get("channel") != channel or event.get("bot_id") or event.get("subtype"):
            return
        action = choose_action(event.get("text", ""), number)
        reply = {"channel": channel, "thread_ts": event.get("thread_ts", event["ts"]),
                 "unfurl_links": False, "unfurl_media": False}
        text = f"Try “review PR {number}”, “status PR {number}”, or “replay PR {number}”."
        if action:
            try:
                result = service.handle(action)
                text = response_text(result)
                links = [(result["revision"]["pr_url"], "GitHub PR"), (result["revision"]["commit_url"], "Current commit"),
                         (result["jira"], "Jira issue")]
                if result.get("source_url"):
                    links.append((result["source_url"], "Source line"))
                if result["previous"]:
                    links.append((result["previous"]["commit_url"], "Previously approved commit"))
                # Free text (including model output) never supplies Slack mentions or markup.
                reply["blocks"] = [
                    {"type": "section", "text": {"type": "plain_text", "text": text[:2900]}},
                    {"type": "context", "elements": [{"type": "mrkdwn", "text": "  ·  ".join(
                        f"<{url}|{label}>" for url, label in links)}]}]
            except Unavailable as exc:
                text = f"Review unavailable. {exc}"
        client.chat_postMessage(text=text[:3500], mrkdwn=False, **reply)
    return mention


def load_env(path):
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", name.strip()):
            raise SystemExit("Invalid configuration line. Use NAME=value in the env file.")
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def start_live():
    c = get_config()
    try:
        from slack_bolt import App
        from slack_bolt.adapter.socket_mode import SocketModeHandler
    except ImportError:
        raise SystemExit("Install live dependencies: python -m pip install -r requirements.txt") from None
    number = int(c["PR_NUMBER"])
    directory = ROOT / ".state"
    directory.mkdir(exist_ok=True)
    # Isolate cache and receipts from organizations and reviewers used in other rehearsals.
    identity = [c[k] for k in ("GITHUB_REPO", "SNYK_ORG", "JIRA_URL", "JIRA_ISSUE", "JIRA_REVIEWER_KEY")]
    identity.append(os.getenv("SNYK_RULE_ID", ""))
    key = hashlib.sha256("\n".join(identity).encode()).hexdigest()[:20]
    store = Store(directory / f"reviews-{key}.sqlite")
    service = ReviewService(store, GitHub(c["GITHUB_REPO"], number, c["GITHUB_TOKEN"]),
                            SnykCode(c["GIT_CHECKOUT"], c["SNYK_ORG"], os.getenv("SNYK_RULE_ID")),
                            Jira(c["JIRA_URL"], c["JIRA_ISSUE"], c["JIRA_TOKEN"], c["JIRA_REVIEWER_KEY"]),
                            Agents(os.getenv("OLLAMA_MODEL", "qwen2.5:3b")))
    app = App(token=c["SLACK_BOT_TOKEN"])
    app.event("app_mention")(slack_listener(service, c["SLACK_CHANNEL"], number))

    SocketModeHandler(app, c["SLACK_APP_TOKEN"]).start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    demo = modes.add_parser("demo", help="serve the offline rehearsal on loopback")
    demo.add_argument("--port", type=int, default=8765)
    live = modes.add_parser("live", help="connect to the configured sandbox via Slack Socket Mode")
    live.add_argument("--env-file", type=Path, help="read NAME=value configuration from a local file")
    args = parser.parse_args()
    if args.mode == "demo":
        from rehearsal import serve
        serve(args.port)
    else:
        if args.env_file:
            if not args.env_file.is_file():
                parser.error("The specified env file does not exist.")
            load_env(args.env_file)
        start_live()
