import { useCallback, useEffect, useState } from 'react'
import { deleteSiteNews, insertSiteNews, listSiteNews, updateSiteNews, type SiteNewsItem } from '../lib/siteNews'
import { BrandLogoLoader } from './BrandLogoLoader'

export function AdminSiteNewsPanel() {
  const [items, setItems] = useState<SiteNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [publishedAt, setPublishedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await listSiteNews()
    setLoading(false)
    if (r.error) {
      setError(r.error)
      setItems([])
      return
    }
    setError(null)
    setItems(r.data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setEditingId(null)
    setPublishedAt(new Date().toISOString().slice(0, 10))
    setTitle('')
    setBody('')
    setImageUrl('')
  }

  const startEdit = (item: SiteNewsItem) => {
    setEditingId(item.id)
    setPublishedAt(item.published_at.slice(0, 10))
    setTitle(item.title)
    setBody(item.body)
    setImageUrl(item.image_url ?? '')
  }

  const save = async () => {
    if (!publishedAt.trim() || !title.trim() || !body.trim()) return
    setSaving(true)
    setError(null)
    const payload = {
      published_at: publishedAt,
      title,
      body,
      image_url: imageUrl.trim() || null,
    }
    const err = editingId
      ? (await updateSiteNews(editingId, payload)).error
      : (await insertSiteNews(payload)).error
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    resetForm()
    void load()
  }

  const remove = async (id: string) => {
    if (!window.confirm('Удалить эту новость?')) return
    setError(null)
    const { error: e } = await deleteSiteNews(id)
    if (e) {
      setError(e)
      return
    }
    if (editingId === id) resetForm()
    void load()
  }

  return (
    <section className="dashboard-tile admin-site-news">
      <h2 className="dashboard-tile__title">Новости сайта</h2>
      <p className="dashboard-field__hint" style={{ marginTop: 0 }}>
        Публикации видны на странице «Новости» без авторизации. Картинка — URL (https…), поле можно оставить пустым.
      </p>

      {loading ? (
        <div className="admin-site-news__loading" aria-label="Загрузка…">
          <BrandLogoLoader size={40} />
        </div>
      ) : null}

      {error ? <p className="join-error">{error}</p> : null}

      <div className="admin-site-news__grid">
        <div className="dashboard-tile admin-site-news__form-card">
          <h3 className="dashboard-tile__subtitle">{editingId ? 'Редактирование' : 'Новая запись'}</h3>
          <div className="dashboard-form dashboard-form--compact">
            <label className="join-label">
              Дата публикации
              <input
                className="join-input"
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="join-label">
              Заголовок
              <input
                className="join-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                maxLength={300}
              />
            </label>
            <label className="join-label">
              Текст
              <textarea
                className="join-input admin-site-news__textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={saving}
                rows={6}
              />
            </label>
            <label className="join-label">
              Изображение (URL, необязательно)
              <input
                className="join-input"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={saving}
              />
            </label>
          </div>
          <div className="admin-site-news__form-actions">
            {editingId ? (
              <button type="button" className="join-btn join-btn--secondary" disabled={saving} onClick={resetForm}>
                Отменить правку
              </button>
            ) : null}
            <button
              type="button"
              className="join-btn join-btn--block"
              disabled={saving || !publishedAt.trim() || !title.trim() || !body.trim()}
              onClick={() => void save()}
            >
              {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>

        <div className="dashboard-tile admin-site-news__list-card">
          <h3 className="dashboard-tile__subtitle">Опубликовано ({items.length})</h3>
          {items.length === 0 ? (
            <p className="admin-site-news__empty">Записей пока нет.</p>
          ) : (
            <ul className="admin-site-news__list">
              {items.map((item) => (
                <li key={item.id} className="admin-site-news__row">
                  <div className="admin-site-news__row-main">
                    <span className="admin-site-news__row-date">{item.published_at}</span>
                    <span className="admin-site-news__row-title">{item.title}</span>
                  </div>
                  <div className="admin-site-news__row-actions">
                    <button type="button" className="admin-site-news__mini-btn" onClick={() => startEdit(item)}>
                      Правка
                    </button>
                    <button type="button" className="admin-site-news__mini-btn admin-site-news__mini-btn--danger" onClick={() => void remove(item.id)}>
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
