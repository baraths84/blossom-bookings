import { checkoutId } from "./preview-port.mjs";

export const workspaceIdentity = {
  name: "blossom-workspace-identity",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url.split("?", 1)[0] !== "/.well-known/blossom-workspace.json") return next();
      response.setHeader("Cache-Control", "no-store");
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ checkoutId }));
    });
  },
};
