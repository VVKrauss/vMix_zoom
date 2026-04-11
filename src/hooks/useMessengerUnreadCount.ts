/**
 * Совместимый shim — весь стейт и подписки теперь в MessengerUnreadContext.
 * Все потребители продолжают работать без изменений.
 */
export { useMessengerUnread as useMessengerUnreadCount } from '../context/MessengerUnreadContext'
