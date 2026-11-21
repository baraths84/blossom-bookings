# Who approved this?

A Slack assistant for a sandbox GitHub PR, a Snyk Code scan, and an on-prem Jira issue. A developer can ask for a security exception in Slack. The designated reviewer grants it in Jira. The receipt identifies the finding, commit, reviewer, reason, and expiry. GitHub manages merge authorization separately.

## Rehearse on a laptop

From the repository root, start the rehearsal with Python 3.11 or later.

```powershell
cd "hackathon idea"
python review.py demo
```

Open [the local review room](http://127.0.0.1:8765). The rehearsal uses fictional identities and scan evidence with the same decision code as the live service. No credentials or package installation are required. Press Ctrl+C to stop it. `--port 8766` selects another port.

1. Click **Review PR 42**. Open the source link at line 6 and inspect the diagnostic log entry. The request is **Pending**.
2. Click **Claim prior approval**. The developer's Slack message appears in the room. The request stays pending.
3. Click **Submit reviewer approval**. Open the simulated Jira issue to inspect the exact comment and reviewer. The exception applies to one finding at the displayed commit.
4. Click **Push next revision**. The current state becomes **Needs review**. Compare the two commit links. Review the second revision to generate a new request.

Additional controls exercise a comment from the wrong user, a scan outage, saved evidence, and a fresh rehearsal. The local room resets when its process exits.

[View the rehearsal room after a reviewer approves an exception.](docs/review-room.png)

## Connect the live sandbox

Use one laptop with network access to your on-prem Jira, one GitHub.com sandbox PR, one existing Jira issue, and a Slack test channel. The service connects outbound over Slack Socket Mode. The browser rehearsal and live service have separate state and credentials.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Fill in `.env` locally. The file uses `NAME=value` lines. Existing environment variables take precedence. Set `GIT_CHECKOUT` to an absolute path to a dedicated clone.

| Integration | Sandbox setup |
|---|---|
| GitHub | Set `GITHUB_REPO`, `PR_NUMBER`, and a fine-grained `GITHUB_TOKEN` with read access to the sandbox PR. The clone’s `origin` must point at the base repository. Configure Git credentials for that remote independently so it can fetch `refs/pull/<number>/head` without prompting. |
| Snyk Code | Install the Snyk CLI on PATH, enable Snyk Code in your sandbox org, and set `SNYK_ORG` to its ID. Authenticate with `snyk auth` or supply `SNYK_TOKEN`. Select one reproducible finding before presenting. Set its `SNYK_RULE_ID` to prioritize it when multiple findings are present. [Snyk Code test](https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test) |
| Jira on-prem | Set `JIRA_URL` to the HTTPS instance base URL, including its context path if applicable, and `JIRA_ISSUE` to an existing sandbox issue. Use `JIRA_TOKEN` for a bot with issue browse, comment, and user lookup permissions. Set `JIRA_REVIEWER_KEY` to the **user key** returned by your instance’s `GET /rest/api/2/user?username=…` for a separate human reviewer. The service supports Jira Data Center–compatible REST v2 and bearer PAT authentication. Use your organization's trusted CA for HTTPS. [Jira REST v2](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.0/#api/2/issue-getComments) · [Data Center PATs](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html) |
| Slack | Create a sandbox app, enable Socket Mode, and create an app-level token with `connections:write` for `SLACK_APP_TOKEN`. Add bot scopes `app_mentions:read` and `chat:write`, subscribe to the `app_mention` bot event, install or reinstall the app, and set `SLACK_BOT_TOKEN`. Invite the bot to the test channel and copy its ID into `SLACK_CHANNEL`. [Slack Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/) |
| Local model | Run Ollama on `127.0.0.1:11434` and download the configured model with `ollama pull qwen2.5:3b`. The developer and AppSec roles get separate prompts containing the PR description, change statistics, scanner evidence, and cited source line. If the model is unavailable, the response labels its commentary **Evidence template**. A blank `OLLAMA_MODEL` selects this mode immediately. |

Start one live service process for the sandbox:

```powershell
.\.venv\Scripts\python.exe review.py live --env-file .env
```

### Run the live demonstration

1. Mention the app with `@ReviewBot review PR 42`, replacing 42 with your configured PR. The service fetches the declared head, materializes tracked regular files from that Git commit in a temporary folder, and runs Snyk Code. Uncommitted edits in your clone are excluded. Snyk Code uses the organization's cloud scanning service. Use sandbox source approved for that service. The reply links the PR, commit, source line, and Jira issue.
2. Ask `@ReviewBot Security already approved PR 42. Can we ship?` The assistant reads the current GitHub head and Jira comments. Its answer reports the disposition of the featured finding and the number of findings from the scan.
3. Sign into **Jira as the designated human reviewer**. Copy the request ID from the bot's comment and submit a new, single-line comment in the format below. Replace the ID, choose a real expiry date, and provide the rationale. The expiry is inclusive through the end of that UTC date. The parser accepts original comments in this exact format.

   ```text
   APPROVE EX-0123456789ABCDEF UNTIL YYYY-MM-DD REASON <reviewer rationale>
   ```

4. Ask `@ReviewBot status PR 42`. Read the reviewer, commit, reason, and expiry aloud. Push a prepared second commit with the finding still present and ask for status again. The earlier receipt remains visible. `review PR 42` scans the new revision and issues a distinct request.
5. For slow inference or scanning, `@ReviewBot replay PR 42` returns **Evidence replay** only when a successful scan has been captured for that exact head. It performs no new scan, Jira write, or decision. A failed live scan still reports **Scan unavailable** on a status read.

### Decision behavior

- Requests bind a repository, PR, full SHA, Jira issue, and fingerprint derived from the scanner rule, file, line and message. The selected finding is shown first. A result never grants a blanket release exception.
- A decision requires the designated Jira user’s key and the exact request ID. The app resolves older Jira author records through the user API. Display names, edited comments, and Slack text cannot grant a decision.
- SQLite under `.state/` persists evidence and receipts across restarts. Repeated reads or duplicate approval comments preserve the first valid receipt. Removing or editing the original Jira decision returns the finding to **Needs review** while retaining its audit record. Expiry and new revisions require fresh review. This prototype supports one designated reviewer and one original decision per request.
- GitHub or Jira connection failures produce an unavailable response. Snyk errors, inconsistent exit codes, and invalid source locations produce **Scan unavailable**. The operator can correct the cause and run the review again.

## Verify

```powershell
python -m unittest discover -s tests -v
```

The suite covers review and approval, wrong owners, expiry, retries, restart, changed heads, failed scans, and saved evidence. Adapter tests run against a real temporary Git repository and simulated GitHub, Snyk, Jira, Slack, and Ollama responses. A final acceptance run needs your sandbox accounts and a Snyk Code finding from your PR.
