globalThis.renderMarkdown = async function renderMarkdown(markdown) {
  const response = await fetch("https://diagram.example/render", {
    method: "POST",
    body: markdown
  });
  return response.json();
};
