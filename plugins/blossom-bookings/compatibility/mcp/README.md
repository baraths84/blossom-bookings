# Bookings context MCP

Dependency-free stdio fixture service: `node server.mjs`. Tools list tickets, read a ticket and read the approved design. Tickets come from the plugin’s `fixtures/issues/`; `coupon-checkout.md` preserves this service’s original design response. It performs no network calls or external writes.

Register as `blossom_bookings` in your Codex MCP settings with command `node` and the absolute path to this server as its argument. The `starter/201-5-explore-safeguards` branch hooks target that exact server/tool name. Restart/reload your trusted project configuration as required by your Codex version. `node --test plugins/blossom-bookings/test/plugin.test.mjs` at the repository root verifies JSON-RPC initialization and fixture retrieval; live Codex integration is a separate check.

This compatibility service is bundled inside the plugin but is configured separately for the safeguards exercise. The installed jira-mock and figma-mock connections use `tools/server.mjs`.
