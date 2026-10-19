async function selectOption(combobox, selection) {
  const page = combobox.page();
  await combobox.focus();
  await combobox.click();
  const id = await combobox.getAttribute("aria-controls");
  const menu = page.locator(`[id="${id}"]`);
  await menu.waitFor();
  const option =
    typeof selection === "object"
      ? menu.getByRole("option").nth(selection.index)
      : menu.locator(`[role="option"][data-value="${selection}"]`);
  await option.click();
  await menu.waitFor({ state: "hidden" });
}
module.exports = { selectOption };
