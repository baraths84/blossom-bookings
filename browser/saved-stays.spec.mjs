import { expect, test } from "@playwright/test";

test("a saved stay survives a reload in the production app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stays for your next escape" })).toBeVisible();
  await page.getByRole("button", { name: "Save Seaside Cottage", exact: true }).click();
  await page.getByRole("link", { name: "Saved", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your saved stays" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Seaside Cottage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unsave Seaside Cottage" })).toBeVisible();
});
