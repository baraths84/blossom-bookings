// The subset of the editor API used by this offline fixture.
declare module "vscode" {
  interface Selection {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  }
  export interface TextEditor {
    readonly selection: Selection;
    readonly document: { getText(range?: Selection): string };
  }
}
