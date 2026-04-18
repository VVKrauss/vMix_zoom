/**
 * URL SVG Twemoji (jsDelivr) для отображения эмодзи там, где системный шрифт даёт «тофу».
 * Логика упрощена: скалярные кодпоинты + ZWJ/fe0f как у имени файлов в twemoji/assets/svg.
 */
export function twemojiSvgUrl(emoji: string): string {
  const out: string[] = []
  for (let i = 0; i < emoji.length; ) {
    const cp = emoji.codePointAt(i)!
    const w = cp > 0xffff ? 2 : 1
    out.push(cp.toString(16))
    i += w
  }
  const name = out.join('-')
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${name}.svg`
}
