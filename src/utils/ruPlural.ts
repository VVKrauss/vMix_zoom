/** Склонение «участник» для числа n (1 участник, 2 участника, 5 участников). */
export function ruParticipantsWord(n: number): string {
  const abs = Math.abs(n) % 100
  const n1 = abs % 10
  if (abs > 10 && abs < 20) return 'участников'
  if (n1 > 1 && n1 < 5) return 'участника'
  if (n1 === 1) return 'участник'
  return 'участников'
}
