function readMarkdown(markdown) {
  const [heading, ...lines] = markdown.trim().split(/\r?\n/);
  return { heading: heading.replace(/^#\s+/, ""), body: lines.join("\n").trim(), steps: [] };
}

function renderFlow(markdown) {
  const preview = readMarkdown(markdown);
  const flow = /^```flow\r?\n([\s\S]+?)\r?\n```$/m.exec(preview.body);
  if (flow) {
    preview.steps = flow[1].split("->").map(step => step.trim());
    preview.body = preview.body.replace(flow[0], "").trim();
  }
  return preview;
}

globalThis.diagramDemo = { readMarkdown, renderFlow };

// Both the browser and the demo tests use this in-memory service.
globalThis.fetch = async function offlineRender(url, options) {
  if (url !== "https://diagram.example/render" || options?.method !== "POST") {
    throw new Error("The offline demo only supports its fictional rendering endpoint.");
  }
  return Response.json(renderFlow(options.body));
};
