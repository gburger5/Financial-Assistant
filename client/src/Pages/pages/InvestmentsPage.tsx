import { Grid } from '@mui/material'
import PieChart from '../components/shared/PieChart'

const InvestmentsPage = () => (
  <div>
    <div className="inner-page-header">
      <div>
        <div className="page-title">Investments</div>
        <div className="page-subtitle">Portfolio overview · All accounts</div>
      </div>
      <button className="btn-outline">↓ Statement</button>
    </div>

    <Grid container spacing={2} sx={{ mb: 3 }}>
      {[
        { label: 'Portfolio Value', value: '$31,480', change: '+$742 today',         positive: true },
        { label: 'Total Return',    value: '+18.4%',  change: '+$4,920 all time',    positive: true },
        { label: '401(k)',          value: '$22,100', change: '8% contribution',      positive: true },
        { label: 'Roth IRA',        value: '$9,380',  change: '$583/mo contribution', positive: true },
      ].map(s => (
        <Grid item xs={6} lg={3} key={s.label}>
          <div className="stat-card" style={{ padding: 16 }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{s.value}</div>
            <div className="stat-change positive">{s.change}</div>
          </div>
        </Grid>
      ))}
    </Grid>

    <Grid container spacing={3}>
      <Grid item xs={12} lg={5}>
        <div className="section-card">
          <div className="section-card-title" style={{ marginBottom: 18 }}>Asset Allocation</div>
          <PieChart data={[
            { name: 'US Stocks',   value: 55, color: '#0A2540', icon: '🇺🇸' },
            { name: 'Intl Stocks', value: 20, color: '#457B9D', icon: '🌍'  },
            { name: 'Bonds',       value: 15, color: '#00D4AA', icon: '📄'  },
            { name: 'Cash',        value: 10, color: '#94A3B8', icon: '💵'  },
          ]} />
        </div>
      </Grid>
      <Grid item xs={12} lg={7}>
        <div className="section-card">
          <div className="section-card-title">Holdings</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Account</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th style={{ textAlign: 'right' }}>Return</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Total Market Index', acct: '401(k)',    value: '$14,200', ret: '+22.1%' },
                { name: 'S&P 500 Fund',       acct: '401(k)',    value: '$7,900',  ret: '+18.4%' },
                { name: 'Target Date 2055',   acct: 'Roth IRA',  value: '$9,380',  ret: '+12.8%' },
                { name: 'Bond Index',         acct: '401(k)',    value: '$4,720',  ret: '+3.2%'  },
                { name: 'Money Market',       acct: 'Brokerage', value: '$2,150',  ret: '+5.1%'  },
              ].map((h, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{h.name}</td>
                  <td>
                    <span style={{ background: '#F1F5F9', padding: '3px 8px', borderRadius: 6, fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                      {h.acct}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{h.value}</td>
                  <td style={{ textAlign: 'right', color: '#00A884', fontWeight: 700 }}>{h.ret}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Grid>
    </Grid>
  </div>
)

export default InvestmentsPage