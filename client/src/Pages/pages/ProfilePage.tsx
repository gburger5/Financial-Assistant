import { useState } from 'react'

const ProfilePage = () => {
  const [editing, setEditing] = useState<string | null>(null)
  const [info, setInfo] = useState({
    firstName: 'Alex',
    lastName:  'Johnson',
    email:     'alex.johnson@email.com',
    phone:     '+1 (555) 012-3456',
  })

  return (
    <div>
      <div className="page-title" style={{ marginBottom: 3 }}>Profile</div>
      <div className="page-subtitle">Manage your personal information and financial preferences</div>

      <div className="profile-avatar-section">
        <div className="profile-avatar-large">
          {info.firstName[0]}{info.lastName[0]}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 19, color: '#0A2540' }}>{info.firstName} {info.lastName}</div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{info.email}</div>
          <button className="btn-outline" style={{ marginTop: 10, padding: '6px 14px', fontSize: 12 }}>Change Photo</button>
        </div>
      </div>

      <div className="profile-field-group">
        <div className="profile-field-header">Personal Information</div>
        {([
          { label: 'First Name', field: 'firstName' as const },
          { label: 'Last Name',  field: 'lastName'  as const },
          { label: 'Email',      field: 'email'     as const },
          { label: 'Phone',      field: 'phone'     as const },
        ]).map(r => (
          <div key={r.field} className="profile-field-row">
            <span className="profile-field-label">{r.label}</span>
            {editing === r.field ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="profile-inline-input"
                  value={info[r.field]}
                  onChange={e => setInfo(p => ({ ...p, [r.field]: e.target.value }))}
                />
                <button className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setEditing(null)}>Save</button>
                <button className="btn-outline" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="profile-field-value">{info[r.field]}</span>
                <button className="profile-edit-btn" onClick={() => setEditing(r.field)}>Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="profile-field-group">
        <div className="profile-field-header">Household & Lifestyle</div>
        {[
          { label: 'Household',  value: 'Me + partner / spouse' },
          { label: 'Dependents', value: 'No dependents'         },
          { label: 'Housing',    value: 'I rent'                },
          { label: 'Transport',  value: 'Car, Public transit'   },
        ].map(r => (
          <div key={r.label} className="profile-field-row">
            <span className="profile-field-label">{r.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="profile-field-value">{r.value}</span>
              <button className="profile-edit-btn">Edit</button>
            </div>
          </div>
        ))}
      </div>

      <div className="profile-field-group">
        <div className="profile-field-header">Financial Goals</div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {['Emergency Fund', 'Invest for Retirement', 'Save for Europe Trip'].map(g => (
              <span key={g} style={{ background: 'rgba(0,212,170,0.09)', color: '#00A884', fontSize: 13, fontWeight: 600, padding: '5px 13px', borderRadius: 20 }}>
                {g}
              </span>
            ))}
          </div>
          <button className="btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}>Edit Goals →</button>
        </div>
      </div>

      <div className="profile-field-group">
        <div className="profile-field-header">Connected Accounts</div>
        <div className="profile-field-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: '#117ACA', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800 }}>
              CHASE
            </div>
            <div>
              <div className="profile-field-value" style={{ fontSize: 13 }}>Chase Primary Checking</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Connected · Last synced 2 hours ago</div>
            </div>
          </div>
          <button className="profile-edit-btn">Manage</button>
        </div>
        <div className="profile-field-row">
          <span className="profile-field-label">Link another account</span>
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>+ Connect Bank</button>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage