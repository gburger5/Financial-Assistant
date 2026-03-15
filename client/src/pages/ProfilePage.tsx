import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import Card from '../components/ui/Card'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import { Building2, CreditCard, Landmark, TrendingUp, Wallet } from 'lucide-react'
import './ProfilePage.css'

interface Account {
  plaidAccountId: string
  name: string
  officialName: string | null
  mask: string | null
  type: string
  subtype: string | null
  currentBalance: number | null
  availableBalance: number | null
  isoCurrencyCode: string | null
}

function accountIcon(type: string) {
  switch (type) {
    case 'credit':     return <CreditCard size={18} />
    case 'investment': return <TrendingUp size={18} />
    case 'loan':       return <Landmark size={18} />
    case 'depository': return <Wallet size={18} />
    default:           return <Building2 size={18} />
  }
}

function formatBalance(amount: number | null, currency: string | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(amount)
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { data: accountsData } = useApi<{ accounts: Account[] }>('/api/accounts')

  if (!user) return null

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email

  const accounts = accountsData?.accounts ?? []

  return (
    <div className="profile-page page">
      <Card className="profile-page__info">
        <div className="profile-page__avatar-row">
          <Avatar name={displayName} size="lg" />
          <div>
            <h3 className="profile-page__name">{displayName}</h3>
            <p className="profile-page__email">{user.email}</p>
          </div>
        </div>

        <div className="profile-page__fields">
          {user.firstName && (
            <div className="profile-page__field">
              <span className="profile-page__field-label">First name</span>
              <span className="profile-page__field-value">{user.firstName}</span>
            </div>
          )}
          {user.lastName && (
            <div className="profile-page__field">
              <span className="profile-page__field-label">Last name</span>
              <span className="profile-page__field-value">{user.lastName}</span>
            </div>
          )}
          <div className="profile-page__field">
            <span className="profile-page__field-label">Email</span>
            <span className="profile-page__field-value">{user.email}</span>
          </div>
          {user.createdAt && (
            <div className="profile-page__field">
              <span className="profile-page__field-label">Member since</span>
              <span className="profile-page__field-value">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h4 className="profile-page__section-title">Linked Accounts</h4>
        {accounts.length > 0 ? (
          <div className="profile-page__accounts">
            {accounts.map((acct) => (
              <div key={acct.plaidAccountId} className="profile-page__account-row">
                <div className="profile-page__account-icon">
                  {accountIcon(acct.type)}
                </div>
                <div className="profile-page__account-info">
                  <span className="profile-page__account-name">
                    {acct.officialName ?? acct.name}
                    {acct.mask && <span className="profile-page__account-mask"> ···{acct.mask}</span>}
                  </span>
                  <span className="profile-page__account-sub">
                    {acct.subtype ?? acct.type}
                  </span>
                </div>
                <span className="profile-page__account-balance">
                  {formatBalance(acct.currentBalance, acct.isoCurrencyCode)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Building2 size={24} />}
            title="No linked accounts yet"
            description="Connect your bank via the setup flow to see your linked accounts here."
          />
        )}
      </Card>
    </div>
  )
}
