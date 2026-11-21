import json
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock, patch

from connectors import Agents, GitHub, Jira, SnykCode, read_sarif
from core import ReviewService, Store, Unavailable, request_body
from rehearsal import DemoGitHub, DemoScanner, FIRST, SECOND, Rehearsal
from review import choose_action, slack_listener


class DecisionTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.db = Path(temp.name) / "room.sqlite"
        self.room = Rehearsal(self.db)
        self.service = self.room.service

    def test_slack_claim_and_wrong_jira_user_cannot_grant(self):
        self.room.run("review")
        for cue in ("claim", "wrong"):
            self.assertEqual(self.room.run(cue)["result"]["state"], "Pending")
        self.assertIsNone(self.room.result["receipt"])

    def test_one_receipt_survives_duplicate_decisions_and_restart(self):
        request = self.room.run("review")["result"]["request"]
        self.room.run("review")
        self.assertEqual(len(self.room.jira.items), 1)
        self.room.run("approve")
        self.room.run("approve")
        restarted = ReviewService(Store(self.db), self.room.github, self.room.scanner, self.room.jira, Agents())
        decision = restarted.handle("status")
        self.assertEqual(decision["state"], "Exception approved")
        self.assertEqual(decision["receipt"]["request_id"], request)
        self.assertEqual(decision["receipt"]["comment_id"], "2")
        with restarted.store.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM receipts").fetchone()[0], 1)

    def test_changed_head_requires_fresh_request_even_for_same_finding(self):
        request = self.room.run("review")["result"]["request"]
        self.room.run("approve")
        stale = self.room.run("push")["result"]
        self.assertEqual(stale["state"], "Needs review")
        self.assertEqual(stale["previous"]["sha"], FIRST)
        self.assertTrue(stale["previous"]["commit_url"].endswith(FIRST))
        revised = self.room.run("review")["result"]
        self.assertEqual(revised["state"], "Needs review")
        self.assertNotEqual(revised["request"], request)
        self.assertIsNone(revised["receipt"])

    def test_expiry_boundary_is_end_of_utc_day(self):
        self.room.run("review")
        receipt = self.room.run("approve")["result"]["receipt"]
        last_day = datetime.fromisoformat(receipt["expires"]).replace(hour=23, minute=59, tzinfo=timezone.utc)
        self.service.clock = lambda: last_day
        self.assertEqual(self.service.handle("status")["state"], "Exception approved")
        self.service.clock = lambda: last_day + timedelta(minutes=1)
        self.assertEqual(self.service.handle("status")["state"], "Expired")

    def test_edited_wrong_request_and_malformed_decisions(self):
        request = self.room.run("review")["result"]["request"]
        for body in [
            f"APPROVE {request} UNTIL 2099-02-30 REASON nope",
            f"APPROVE {request} UNTIL 2099-01-01 REASON  ",
            "APPROVE EX-1111111111111111 UNTIL 2099-01-01 REASON unrelated",
            f"APPROVE {request} UNTIL 2001-01-01 REASON expired when posted",
        ]:
            self.room.jira.add(body, self.room.jira.reviewer)
        self.room.jira.add(f"APPROVE {request} UNTIL 2099-01-01 REASON edited", self.room.jira.reviewer)
        self.room.jira.items[-1]["updated"] = "2098-11-21T10:30:00Z"
        self.assertEqual(self.service.handle("status")["state"], "Pending")

    def test_failed_scan_preserves_only_labeled_same_sha_replay(self):
        self.room.run("review")
        self.room.run("approve")
        self.assertEqual(self.room.run("fail")["result"]["state"], "Scan unavailable")
        replay = self.room.run("replay")["result"]
        self.assertEqual(replay["state"], "Evidence replay")
        self.assertIsNotNone(replay["finding"])
        self.assertIsNone(replay["receipt"])
        self.assertEqual(self.service.handle("status")["state"], "Scan unavailable")
        self.room.run("push")
        self.assertEqual(self.service.handle("replay")["state"], "Replay unavailable")

    def test_head_moved_during_scan_never_publishes_old_request(self):
        def moving_scan(rev):
            self.room.github.sha = SECOND
            return DemoScanner().scan(rev)
        self.room.scanner.scan = moving_scan
        result = self.service.handle("review")
        self.assertEqual(result["revision"]["sha"], SECOND)
        self.assertEqual(result["state"], "Needs review")
        self.assertEqual(self.room.jira.items, [])

    def test_unavailable_jira_does_not_report_cached_approval(self):
        self.room.run("review")
        self.room.run("approve")
        with patch.object(self.room.jira, "comments", side_effect=Unavailable("Jira offline.")):
            result = self.service.handle("status")
        self.assertEqual(result["state"], "Jira unavailable")
        self.assertIsNone(result["receipt"])

    def test_removed_review_comment_invalidates_disposition_but_preserves_receipt(self):
        request = self.room.run("review")["result"]["request"]
        self.room.run("approve")
        self.room.jira.items.pop()
        result = self.service.handle("status")
        self.assertEqual(result["state"], "Needs review")
        self.assertIsNone(result["receipt"])
        self.assertIsNotNone(self.service.store.receipt(request))

    def test_saved_replay_is_available_while_rescan_is_running(self):
        self.room.run("review")
        started, finish = Event(), Event()
        def slow_scan(rev):
            started.set()
            finish.wait(5)
            return DemoScanner().scan(rev)
        self.room.scanner.scan = slow_scan
        with ThreadPoolExecutor(max_workers=2) as pool:
            scanning = pool.submit(self.service.handle, "review")
            try:
                self.assertTrue(started.wait(2))
                replay = pool.submit(self.service.handle, "replay").result(timeout=2)
                self.assertEqual(replay["state"], "Evidence replay")
            finally:
                finish.set()
            self.assertEqual(scanning.result(timeout=2)["state"], "Pending")

    def test_zero_findings_has_no_exception_request(self):
        self.room.scanner.scan = lambda rev: []
        self.assertEqual(self.service.handle("review")["state"], "No findings reported")
        self.assertEqual(self.room.jira.items, [])

    def test_slack_sdk_handler_routes_to_the_original_thread_and_sandbox_only(self):
        client = Mock()
        handler = slack_listener(self.service, "CROOM", 42)
        event = {"channel": "CROOM", "ts": "123", "text": "<@BOT> review PR 42"}
        handler(event, client)
        self.assertIn("Pending", client.chat_postMessage.call_args.kwargs["text"])
        self.assertEqual(client.chat_postMessage.call_args.kwargs["thread_ts"], "123")
        handler(dict(event, ts="456", thread_ts="123", text="<@BOT> Security approved PR #42. Ship?"), client)
        self.assertIn("Pending", client.chat_postMessage.call_args.kwargs["text"])
        self.assertEqual(client.chat_postMessage.call_args.kwargs["thread_ts"], "123")
        handler(dict(event, channel="COTHER"), client)
        handler(dict(event, bot_id="B123"), client)
        self.assertEqual(client.chat_postMessage.call_count, 2)
        self.assertIsNone(choose_action("review PR 43", 42))


class AdapterTests(unittest.TestCase):
    def test_github_validates_repository_and_returns_sha_pinned_link(self):
        github = GitHub("demo/team", 42, "fictional")
        data = {"base": {"repo": {"full_name": "demo/team"}}, "head": {"sha": FIRST}, "title": "Demo"}
        with patch("connectors.request_json", return_value=data):
            self.assertTrue(github.head().source_base.endswith("/blob/" + FIRST))
            data["base"]["repo"]["full_name"] = "demo/unrelated"
            with self.assertRaises(Unavailable):
                github.head()

    def test_on_prem_jira_paginates_resolves_keys_and_deduplicates_posts(self):
        jira = Jira("https://jira.example.test", "SEC-42", "fictional", "reviewer-key")
        rev = DemoGitHub().head()
        finding = DemoScanner().scan(rev)[0]
        body = request_body("EX-example", rev, finding, "https://example.test/file")
        calls = []
        def api(path, method="GET", body=None):
            calls.append((method, path))
            if path == "myself":
                return {"key": "bot-key"}
            if path.startswith("user?"):
                return {"key": "bot-key"}
            start = 1 if "startAt=1&" in path else 0
            return {"comments": [records[start]], "startAt": start, "total": 2}
        records = [{"body": "unrelated"}, {"body": body, "author": {"name": "bot"}}]
        jira.api = api
        comments = jira.comments()
        jira.ensure_request("EX-example", rev, finding, "https://example.test/file", comments)
        self.assertEqual(len(comments), 2)
        self.assertIn(("GET", "user?username=bot"), calls)
        self.assertFalse(any(method == "POST" for method, _ in calls))
        jira.ensure_request("EX-other", rev, finding, "https://example.test/file", comments)
        self.assertEqual(calls[-1], ("POST", "issue/SEC-42/comment"))

    def test_jira_bot_cannot_be_its_own_reviewer(self):
        jira = Jira("https://jira.example.test", "SEC-42", "fictional", "same-key")
        jira.api = Mock(return_value={"key": "same-key"})
        with self.assertRaisesRegex(Unavailable, "distinct"):
            jira.comments()

    def test_ollama_roles_are_separate_and_model_failure_has_labeled_fallback(self):
        rev = DemoGitHub().head()
        finding = DemoScanner().scan(rev)[0]
        with patch("connectors.request_json", return_value={"message": {"content": "Draft"}}) as chat:
            notes = Agents("local-model").explain(rev, finding)
            self.assertEqual(notes["mode"], "Local model draft")
            roles = [c.kwargs["body"]["messages"][0]["content"] for c in chat.call_args_list]
            self.assertEqual(len(set(roles)), 2)
        with patch("connectors.request_json", side_effect=Unavailable("Offline")):
            self.assertEqual(Agents("local-model").explain(rev, finding)["mode"], "Evidence template")

    def test_scan_pins_actual_git_contents_and_maps_sarif_to_a_real_line(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            remote, local = root / "origin", root / "operator clone"
            remote.mkdir()
            def git(*args, cwd=remote):
                return subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.PIPE).decode().strip()
            git("init")
            (remote / "audit notes.txt").write_text("first\nfixture finding\n", encoding="utf-8")
            (remote / ".gitattributes").write_text('"audit notes.txt" export-ignore\n', encoding="utf-8")
            git("add", ".")
            git("-c", "user.name=Demo", "-c", "user.email=demo@example.test", "commit", "-m", "Fixture")
            sha = git("rev-parse", "HEAD")
            git("update-ref", "refs/pull/42/head", sha)
            git("clone", str(remote), str(local))
            (local / "audit notes.txt").write_text("uncommitted local change", encoding="utf-8")
            scanner = SnykCode(local, "demo-org")
            rev = SimpleNamespace(sha=sha, number=42)
            from connectors import run_command
            def run(args, cwd, timeout, service, env=None):
                if service != "Snyk Code":
                    return run_command(args, cwd, timeout, service, env)
                self.assertEqual((cwd / "audit notes.txt").read_text(), "first\nfixture finding\n")
                self.assertNotIn("JIRA_TOKEN", env)
                report = Path(args[-1].split("=", 1)[1])
                report.write_text(json.dumps(sarif("audit%20notes.txt", 2)))
                return SimpleNamespace(returncode=1)
            with patch("connectors.shutil.which", return_value="stub-snyk"), patch("connectors.run_command", side_effect=run):
                finding = scanner.scan(rev)[0]
            self.assertEqual((finding.path, finding.line), ("audit notes.txt", 2))
            self.assertEqual((local / "audit notes.txt").read_text(), "uncommitted local change")
            with self.assertRaisesRegex(Unavailable, "changed"):
                scanner.scan(SimpleNamespace(sha=FIRST, number=42))

    def test_invalid_sarif_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "file.txt").write_text("line\n")
            report = root / "scan.sarif"
            for path, line in [("file.txt", 20), ("../outside", 1), ("missing.txt", 1)]:
                with self.subTest(path=path, line=line):
                    report.write_text(json.dumps(sarif(path, line)))
                    with self.assertRaises(Unavailable):
                        read_sarif(report, root)


def sarif(path, line):
    return {"version": "2.1.0", "runs": [{"tool": {"driver": {"name": "Snyk Code"}}, "results": [
        {"ruleId": "Demo/Rule", "message": {"text": "Fixture finding."}, "locations": [
            {"physicalLocation": {"artifactLocation": {"uri": path}, "region": {"startLine": line}}}]}]}]}


if __name__ == "__main__":
    unittest.main()
