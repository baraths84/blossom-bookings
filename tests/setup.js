import "@testing-library/jest-dom/vitest";
import { JSDOM } from "jsdom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // Newer Node versions expose their own storage; tests need the browser storage.
  const storageWindow = new JSDOM("", { url: "http://localhost" }).window;
  vi.stubGlobal("localStorage", storageWindow.localStorage);
  vi.stubGlobal("sessionStorage", storageWindow.sessionStorage);
  storageWindow.close();
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
