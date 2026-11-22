import type { TextEditor } from "vscode";

export async function previewTitle(editor: TextEditor) {
  const previewText = editor.document.getText(editor.selection);
  return sendPreview(previewText);
}

async function sendPreview(text: string) {
  const response = await fetch("https://preview.example/render", {
    method: "POST",
    body: text
  });
  return response.text();
}
