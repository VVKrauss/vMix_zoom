export type TelegramEventType =
  | 'room_created'
  | 'participant_joined'
  | 'participant_left'
  | 'room_closed'
  | 'room_debug'
  | 'egress_started'
  | 'egress_stopped'

export type TelegramNotificationsResponse = {
  configured: boolean
  enabled: boolean
  immediateEvents: TelegramEventType[]
  summaryHours: number
}

export type TelegramNotificationsPayload = {
  enabled?: boolean
  immediateEvents?: TelegramEventType[]
  summaryHours?: number
}

export type TelegramMode = 'all' | 'new_users' | 'room_created' | 'summary_4h' | 'summary_8h' | 'summary_24h'
