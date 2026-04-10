import { useContext } from 'react'
import { SettingsContext } from '../context/SettingsContext'
import type { SettingsContextValue } from '../context/SettingsContext'

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}