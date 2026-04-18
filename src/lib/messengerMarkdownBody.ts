/** Превращает одиночные переводы строк в hard line breaks Markdown (GFM), сохраняя абзацы `\n\n`. */
export function messengerBodyForMarkdown(body: string): string {
  return (body ?? '').replace(/\r\n/g, '\n').replace(/([^\n])\n(?!\n)/g, '$1  \n')
}
