import { registerSW } from 'virtual:pwa-register'

let bannerEl: HTMLDivElement | null = null

function removeBanner() {
  bannerEl?.remove()
  bannerEl = null
}

function showUpdateBanner(applyUpdate: () => Promise<void>) {
  if (bannerEl?.isConnected) return

  const root = document.createElement('div')
  root.className = 'pwa-update-banner'
  root.setAttribute('role', 'status')
  root.innerHTML =
    '<span class="pwa-update-banner__text">Доступна новая версия приложения.</span>' +
    '<div class="pwa-update-banner__actions">' +
    '<button type="button" class="pwa-update-banner__btn pwa-update-banner__btn--primary">Обновить</button>' +
    '<button type="button" class="pwa-update-banner__btn pwa-update-banner__btn--ghost">Позже</button>' +
    '</div>'

  const [primary, ghost] = root.querySelectorAll('button')
  primary?.addEventListener('click', () => {
    void applyUpdate().finally(() => removeBanner())
  })
  ghost?.addEventListener('click', () => removeBanner())

  document.body.appendChild(root)
  bannerEl = root
}

/**
 * PWA: не трогаем сеть Supabase в SW (см. vite.config), здесь только мягкое обновление клиента.
 */
export function registerPwa() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // `true` → apply update + reload page (virtual:pwa-register API)
      showUpdateBanner(() => updateSW(true))
    },
    onOfflineReady() {
      /* Офлайн-оболочка готова; мессенджер и комнаты всё равно требуют сеть. */
    },
  })
}
