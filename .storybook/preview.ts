import "../src/styles.css";

function removeScenarioAccessibleName(): void {
  const card = document.querySelector<HTMLElement>("[data-testid='seeded-issue-api-500']");
  const label = card?.querySelector("strong");
  if (!card || !label) return;
  label.replaceChildren();
  card.setAttribute("aria-label", "");
}

export const decorators = [
  (Story: () => unknown, context: { id: string }) => {
    if (context.id !== "visual-hive-test-lab-fixtures--scenario-mutation-card") return Story();
    const observer = new MutationObserver(() => {
      removeScenarioAccessibleName();
      if (document.querySelector("[data-testid='seeded-issue-api-500']")) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    queueMicrotask(removeScenarioAccessibleName);
    return Story();
  }
];

export const parameters = {
  layout: "padded"
};
