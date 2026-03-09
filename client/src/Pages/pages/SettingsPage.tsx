import { useState } from 'react'
import type { SettingsState, BoolSetting } from '../types/dashboard'
import Toggle from '../components/shared/Toggle'

const SettingsPage = () => {
  const [s, setS] = useState<SettingsState>({
    theme: 'light', currency: 'USD', dateFormat: 'MM/DD/YYYY',
    budgetAlerts: true, emailNotifs: true, pushNotifs: true, goalReminders: true,
  })

  const tog = (k: BoolSetting) => setS(p => ({ ...p, [k]: !p[k] }))

  return (
    <div>
      <div className="page-title" style={{ marginBottom: 3 }}>Settings</div>
      <div className="page-subtitle">Customize your FinanceAI experience</div>

      {/* Appearance */}
      <div className="settings-group">
        <div className="settings-group-header">🎨 Appearance</div>
        {([
          { label: 'Theme',       desc: 'Choose your preferred color scheme',    key: 'theme',      opts: [['light','Light'],['dark','Dark'],['system','System']] },
          { label: 'Currency',    desc: 'Display currency for all amounts',       key: 'currency',   opts: [['USD','USD ($)'],['EUR','EUR (€)'],['GBP','GBP (£)']] },
          { label: 'Date Format', desc: 'How dates are shown throughout the app', key: 'dateFormat', opts: [['MM/DD/YYYY','MM/DD/YYYY'],['DD/MM/YYYY','DD/MM/YYYY'],['YYYY-MM-DD','YYYY-MM-DD']] },
        ] as { label: string; desc: string; key: 'theme' | 'currency' | 'dateFormat'; opts: [string,string][] }[]).map(r => (
          <div key={r.key} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{r.label}</div>
              <div className="settings-row-desc">{r.desc}</div>
            </div>
            <select className="settings-select" value={s[r.key]} onChange={e => setS(p => ({ ...p, [r.key]: e.target.value }))}>
              {r.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Budget */}
      <div className="settings-group">
        <div className="settings-group-header">📋 Budget</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Spending Alerts</div>
            <div className="settings-row-desc">Alert when a category hits 80% of its budget</div>
          </div>
          <Toggle on={s.budgetAlerts} onToggle={() => tog('budgetAlerts')} />
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="settings-group">
        <div className="settings-group-header">🏦 Connected Accounts</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 36, height: 36, background: '#117ACA', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
              CHASE
            </div>
            <div className="settings-row-info">
              <div className="settings-row-label">Chase Primary Checking</div>
              <div className="settings-row-desc">Connected · Last synced 2 hours ago</div>
            </div>
          </div>
          <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>Disconnect</button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Add New Account</div>
            <div className="settings-row-desc">Connect another bank or investment account via Plaid</div>
          </div>
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>+ Connect</button>
        </div>
      </div>

      {/* Security */}
      <div className="settings-group">
        <div className="settings-group-header">🔐 Security</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Change Password</div>
            <div className="settings-row-desc">Update your account password</div>
          </div>
          <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>Update →</button>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-group">
        <div className="settings-group-header">📦 Data Management</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label" style={{ color: '#EF4444' }}>Delete Account</div>
            <div className="settings-row-desc">Permanently remove your account and all data</div>
          </div>
          <button style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: '1.5px solid #EF4444', color: '#EF4444', background: '#fff', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage