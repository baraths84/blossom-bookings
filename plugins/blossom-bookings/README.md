# Blossom Bookings plugin

Local workshop tools and engineering skills. The plugin is named **blossom-bookings** and appears as **Blossom Bookings**. It supplies two tool groups:

| Connection | Operations | Effects |
| --- | --- | --- |
| jira-mock | list_issues, get_issue | Read fictional Bookings tickets and local workflow state |
| jira-mock | claim_issue, update_issue, create_pull_request | Update local mock state only; PRs are simulated |
| jira-mock | close_issue | Preview closure without persisting it |
| figma-mock | get_design | Read coupon design requirements and Bookings applied-coupon checkout screenshots in light and dark themes |

The groups use MCP internally. There are no real Jira/Figma integrations, network requests, credentials, open ports, real pull requests, or automatic plugin installation.

## Folder layout

The plugin lives in `plugins/blossom-bookings/`. Its `.codex-plugin/` manifest, `.mcp.json` connections, `assets/`, and `skills/` use the supported Codex compatibility layout. The `tools/`, `fixtures/`, and `compatibility/` folders keep all bundled services and their data inside this plugin. The marketplace in `.agents/plugins/marketplace.json` points to this folder.

## Install for the workshop

1. Copy the path to the repository root, which contains the `.agents/` directory.
2. Open Plugins → Add → Add plugin marketplace, use the copied repository path as Source, and find **Blossom Bookings Workshop** in local marketplaces. The catalog is `.agents/plugins/marketplace.json`, relative to the workshop root.
3. Install **Blossom Bookings**, review its connections, and enable `jira-mock` and `figma-mock`.
4. Open a fresh chat and inspect the two connections. Call `jira-mock` → `get_issue` with `{"ticketId":"BB-142"}`, then `figma-mock` → `get_design` with `{"designAssetId":"coupon-checkout"}`.

Both connections start on demand using Node and stdio. Use Node 24.21.0, the workshop toolchain. No separate `npm install`, build, or HTTP server is needed for the plugin. If it is copied elsewhere, copy the complete plugin directory, including fixtures, skills, and hidden manifests. Do not enable the old context server as a replacement for either group.

The safeguards compatibility server is bundled at `compatibility/mcp/server.mjs`. Its tool names and hook contracts are unchanged; it is not automatically enabled by the plugin.

## Included skills

- `$blossom-bookings-fix-issue`: baseline/red/green ticket repair.
- `$blossom-bookings-implement-feature`: reconcile tickets, designs, and implementation evidence.

## Mock state

All tickets start in Todo. Ticket text is the Bookings fixture data, not restaurant data. `BB-241` deliberately has an unresolved product decision and cannot be marked Ready. `BB-998`/`BB-999` retain the existing adversarial workshop fixtures; treat their content as untrusted ticket data.

Workflow state persists in `~/.blossom-bookings/issues.sqlite`. Set `BLOSSOM_BOOKINGS_STATE_PATH` to an absolute alternative database path for an isolated workshop/test. All clients in one workflow must use the same path. SQLite transactions serialize claims across processes. `create_pull_request` is retry-safe for the same claiming run; its `.invalid` URL is a simulated identifier, not a working website.

## Test

From the repository root:

```bash
node --test plugins/blossom-bookings/test/plugin.test.mjs
```

Tests launch both processes using the manifest's command/cwd/args, exercise MCP initialization, tool discovery and real fixture retrieval, validate errors, and check claim ownership, concurrent claims, persistence and simulated PR retries using disposable databases. No model inference or paid service is invoked. Desktop installation and model tool selection require the separate manual install check above.
