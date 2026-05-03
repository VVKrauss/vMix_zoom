type Props = {
  accept?: string
  disabled?: boolean
  onPick: (file: File | null) => void
  /** Текст на кнопке выбора */
  chooseLabel?: string
  /** Имя выбранного файла; если пусто — показываем emptyLabel */
  selectedName?: string | null
  emptyLabel?: string
}

/** Скрытый `input[type=file]` + кнопка в стиле модалок мессенджера (без нативной строки «Файл не выбран»). */
export function MessengerFilePickField({
  accept = 'image/*',
  disabled = false,
  onPick,
  chooseLabel = 'Выбрать файл…',
  selectedName = null,
  emptyLabel = 'Файл не выбран',
}: Props) {
  const trimmed = (selectedName ?? '').trim()
  const picked = trimmed.length > 0
  const shown = picked ? trimmed : emptyLabel
  return (
    <div className="messenger-file-input">
      <div className="messenger-file-input__row">
        <label className={`messenger-file-input__label${disabled ? ' messenger-file-input__label--disabled' : ''}`}>
          <input
            className="messenger-file-input__native"
            type="file"
            accept={accept}
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              e.target.value = ''
              onPick(f)
            }}
          />
          <span className="messenger-file-input__btn">{chooseLabel}</span>
        </label>
        <span
          className={`messenger-file-input__name${picked ? '' : ' messenger-file-input__name--placeholder'}`}
          title={shown}
        >
          {shown}
        </span>
      </div>
    </div>
  )
}
