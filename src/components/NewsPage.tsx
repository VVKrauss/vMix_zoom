import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { listSiteNews, type SiteNewsItem } from '../lib/siteNews'
import { BrandLogoLoader } from './BrandLogoLoader'
import { ChevronLeftIcon } from './icons'

function formatNewsDate(isoDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T12:00:00Z`) : new Date(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function NewsPage() {
  const [items, setItems] = useState<SiteNewsItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    void listSiteNews({ limit: 1 }).then((r) => {
      if (r.error) {
        setError(r.error)
        setItems([])
        return
      }
      setError(null)
      setItems(r.data ?? [])
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="join-screen join-screen--themed news-page">
      <div className="news-page__inner">
        <div className="news-page__head">
          <Link to="/" className="news-page__back" title="На главную" aria-label="На главную">
            <ChevronLeftIcon />
          </Link>
          <div className="join-logo-static news-page__logo" aria-hidden>
            <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
          </div>
          <span className="news-page__head-slot" aria-hidden />
        </div>

        <h1 className="news-page__title">Новости</h1>

        {items === null ? (
          <div className="news-page__loading" aria-label="Загрузка…">
            <BrandLogoLoader size={48} />
          </div>
        ) : error ? (
          <p className="join-error news-page__err">{error}</p>
        ) : items.length === 0 ? (
          <p className="news-page__empty">Пока нет записей.</p>
        ) : (
          <ul className="news-page__list">
            {items.map((item) => (
              <li key={item.id} className="news-page__item">
                <time className="news-page__item-date" dateTime={item.published_at}>
                  {formatNewsDate(item.published_at)}
                </time>
                <h2 className="news-page__item-title">{item.title}</h2>
                {item.image_url ? (
                  <div className="news-page__item-img-wrap">
                    <img src={item.image_url} alt="" className="news-page__item-img" loading="lazy" />
                  </div>
                ) : null}
                <div className="news-page__item-body news-page__item-body--md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children, ...props }) => (
                        <a {...props} href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {item.body ?? ''}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
