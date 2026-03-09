export type PageId =
  | 'overview' | 'transactions' | 'budget' | 'investments'
  | 'goals' | 'debts' | 'notifications' | 'profile' | 'settings'

export interface Notification {
  id: number
  icon: string
  iconBg: string
  title: string
  desc: string
  time: string
  unread: boolean
  type: 'alert' | 'tip' | 'action' | 'update'
}

export interface SettingsState {
  theme: 'light' | 'dark' | 'system'
  currency: 'USD' | 'EUR' | 'GBP'
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  budgetAlerts: boolean
  emailNotifs: boolean
  pushNotifs: boolean
  goalReminders: boolean
}

export type BoolSetting = 'budgetAlerts' | 'emailNotifs' | 'pushNotifs' | 'goalReminders'