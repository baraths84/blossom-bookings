import { expect, test } from "@playwright/test";

test("books a stay from the pre-exercise checkout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "View Seaside Cottage" }).click();
  await page.getByRole("button", { name: "Reserve this stay" }).click();

  await expect(page.getByRole("heading", { name: "Make it a stay." })).toBeVisible();
  await expect(page.getByText("$240 × 3 nights")).toBeVisible();
  await expect(page.getByLabel("Coupon code")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage coupons" })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm demo booking" }).click();

  await expect(page.getByRole("heading", { name: /You’re all set/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText("$720 USD", { exact: true })).toBeVisible();
});
