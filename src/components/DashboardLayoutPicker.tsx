import type { StoredLayoutMode } from '../config/roomUiStorage'
import { DashboardMenuPicker } from './DashboardMenuPicker'

const OPTIONS: { value: StoredLayoutMode; label: string }[] = [
  { value: 'pip', label: 'Картинка в картинке' },
  { value: 'grid', label: 'Плитки' },
  { value: 'speaker', label: 'Спикер' },
]

export function DashboardLayoutPicker({
  value,
  onChange,
}: {
  value: StoredLayoutMode
  onChange: (v: StoredLayoutMode) => void
}) {
  return (
    <DashboardMenuPicker
      value={value}
      onChange={onChange}
      options={OPTIONS}
      ariaLabelPrefix="Вид по умолчанию"
      modifierClass="admin-role-picker--dashboard-layout"
    />
  )
}
