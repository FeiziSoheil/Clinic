/** Scroll a TOC list container so `item` is centered when not already visible enough. */
export function scrollTocItemIntoView(
  container: HTMLElement,
  item: HTMLElement,
): void {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  const fullyVisible =
    itemRect.top >= containerRect.top - 1 &&
    itemRect.bottom <= containerRect.bottom + 1;

  const itemCenter = itemRect.top + itemRect.height / 2;
  const containerCenter = containerRect.top + containerRect.height / 2;
  const centeredEnough =
    Math.abs(itemCenter - containerCenter) <= containerRect.height * 0.15;

  if (fullyVisible && centeredEnough) return;

  const itemTop = itemRect.top - containerRect.top + container.scrollTop;
  const targetScroll =
    itemTop - container.clientHeight / 2 + item.clientHeight / 2;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const nextScroll = Math.max(0, Math.min(targetScroll, maxScroll));

  if (Math.abs(container.scrollTop - nextScroll) < 1) return;

  container.scrollTo({ top: nextScroll, behavior: "auto" });
}
