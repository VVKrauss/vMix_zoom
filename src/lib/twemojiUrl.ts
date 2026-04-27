/**
 * Раньше использовали внешний CDN (jsDelivr) для Twemoji SVG.
 * Для устойчивости (в т.ч. в РФ без VPN) возвращаем `null` и рендерим системный emoji.
 */
export function twemojiSvgUrl(_emoji: string): string | null {
  return null
}
