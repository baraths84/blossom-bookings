import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

// Use the whole checkout path because linked worktrees can share the same folder name.
const checkout = realpathSync(new URL("../", import.meta.url));
const digest = createHash("sha256").update(checkout).digest();
export const checkoutId = digest.toString("hex");
const slot = digest.readUInt32BE();
export const previewPort = Number(process.env.BLOSSOM_PORT_BASE ?? (12000 + (slot % 16000) * 2));

if (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65534) {
  throw new Error("BLOSSOM_PORT_BASE must be an integer from 1024 to 65534. Playwright uses the next port.");
}

if (import.meta.main) console.log(previewPort);
