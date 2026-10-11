// Keep current and next lessons visible, including cancellations between them.
// This changes only the Home preview, never the stored schedule.
export function selectHomeOverviewEntries(entries, expanded, isCancelled) {
  let active = 0, end = entries.length;
  for (let i = 0; i < entries.length; i++) {
    if (!isCancelled(entries[i])) active++;
    if (active === 4) { end = i + 1; break; }
  }
  return { visible: expanded ? entries : entries.slice(0, end), hasMore: end < entries.length };
}
export function homeOverviewToggleLabel(expanded, language) {
  const labels = {
    ru: { full: 'Показать остальные пары', compact: 'Только ближайшие пары' },
    kz: { full: 'Қалған сабақтарды көрсету', compact: 'Тек алдағы сабақтар' }
  };
  return labels[language === 'kz' ? 'kz' : 'ru'][expanded ? 'compact' : 'full'];
}
