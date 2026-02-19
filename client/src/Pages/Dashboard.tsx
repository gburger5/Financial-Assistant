import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  IconButton,
  Avatar,
  Tooltip,
} from '@mui/material'
import {
  Person,
  Notifications,
  Settings,
  Logout,
} from '@mui/icons-material'
import './Dashboard.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Helper to read token from whichever storage it was saved in
const getToken = () =>
  localStorage.getItem('token') || sessionStorage.getItem('token')

// Helper to clear token from both storages
const clearToken = () => {
  localStorage.removeItem('token')
  sessionStorage.removeItem('token')
}

function Dashboard() {
  const navigate = useNavigate()

  useEffect(() => {
    const verifyAuth = async () => {
      const token = getToken()

      if (!token) {
        navigate('/login')
        return
      }

      try {
        const res = await fetch(`${API_BASE}/verify`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          clearToken()
          navigate('/login')
        }
      } catch {
        clearToken()
        navigate('/login')
      }
    }

    verifyAuth()
  }, [navigate])

  const handleLogout = () => {
    clearToken()
    navigate('/login')
  }

  return (
    <Box className="dashboard-wireframe-container">
      {/* Header */}
      <Box className="dashboard-header">
        <Container maxWidth="xl">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
            {/* Logo Area */}
            <Box className="placeholder-box logo-box">
              <Typography variant="body2" color="text.secondary">Logo</Typography>
            </Box>

            {/* Header Actions */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <IconButton>
                <Notifications />
              </IconButton>
              <IconButton>
                <Settings />
              </IconButton>
              <IconButton>
                <Avatar sx={{ width: 40, height: 40 }}>
                  <Person />
                </Avatar>
              </IconButton>
              <Tooltip title="Logout">
                <IconButton onClick={handleLogout} color="default">
                  <Logout />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        {/* Welcome Section */}
        <Box sx={{ mb: 4 }}>
          <Box className="placeholder-box welcome-box">
            <Typography variant="h5">Welcome Message</Typography>
            <Typography variant="body2" color="text.secondary">Subtitle/Date</Typography>
          </Box>
        </Box>
        <Grid container spacing={3}>

          {/* Financial Summary Cards Row */}
          <Grid item xs={12} md={4}>
            <Paper className="wireframe-card summary-card">
              <Box className="placeholder-box">
                <Typography variant="body2" color="text.secondary">Total Balance</Typography>
                <Typography variant="h4" sx={{ my: 1 }}>$XX,XXX.XX</Typography>
                <Typography variant="caption">+X.X% this month</Typography>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper className="wireframe-card summary-card">
              <Box className="placeholder-box">
                <Typography variant="body2" color="text.secondary">Monthly Income</Typography>
                <Typography variant="h4" sx={{ my: 1 }}>$X,XXX.XX</Typography>
                <Typography variant="caption">From all sources</Typography>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper className="wireframe-card summary-card">
              <Box className="placeholder-box">
                <Typography variant="body2" color="text.secondary">Monthly Expenses</Typography>
                <Typography variant="h4" sx={{ my: 1 }}>$X,XXX.XX</Typography>
                <Typography variant="caption">Across all categories</Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Agent Actions Section */}
          <Grid item xs={12} lg={8}>
            <Paper className="wireframe-card section-card">
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  AI Agent Actions
                </Typography>
                <Button variant="outlined" size="small">
                  View All
                </Button>
              </Box>

              <Box className="placeholder-box list-item-box" sx={{ mb: 2 }}>
                <Typography variant="body2">Agent Action Item 1</Typography>
                <Typography variant="caption" color="text.secondary">Description and timestamp</Typography>
              </Box>

              <Box className="placeholder-box list-item-box" sx={{ mb: 2 }}>
                <Typography variant="body2">Agent Action Item 2</Typography>
                <Typography variant="caption" color="text.secondary">Description and timestamp</Typography>
              </Box>

              <Box className="placeholder-box list-item-box">
                <Typography variant="body2">Agent Action Item 3</Typography>
                <Typography variant="caption" color="text.secondary">Description and timestamp</Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Quick Actions Sidebar */}
          <Grid item xs={12} lg={4}>
            <Paper className="wireframe-card section-card">
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Quick Actions
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box className="placeholder-box action-button-box">
                  <Typography variant="body2">View Transactions</Typography>
                </Box>
                <Box className="placeholder-box action-button-box">
                  <Typography variant="body2">Manage Budget</Typography>
                </Box>
                <Box className="placeholder-box action-button-box">
                  <Typography variant="body2">Agent Actions</Typography>
                </Box>
                <Box className="placeholder-box action-button-box">
                  <Typography variant="body2">Action History</Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Budget Overview */}
          <Grid item xs={12} lg={6}>
            <Paper className="wireframe-card section-card">
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Budget Overview
                </Typography>
                <Button variant="text" size="small">
                  Manage
                </Button>
              </Box>

              <Box className="placeholder-box budget-item-box" sx={{ mb: 2 }}>
                <Typography variant="body2">Category 1</Typography>
                <Box className="progress-bar-placeholder" sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">$XXX / $XXX (XX%)</Typography>
              </Box>

              <Box className="placeholder-box budget-item-box" sx={{ mb: 2 }}>
                <Typography variant="body2">Category 2</Typography>
                <Box className="progress-bar-placeholder" sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">$XXX / $XXX (XX%)</Typography>
              </Box>

              <Box className="placeholder-box budget-item-box">
                <Typography variant="body2">Category 3</Typography>
                <Box className="progress-bar-placeholder" sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">$XXX / $XXX (XX%)</Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Recent Transactions */}
          <Grid item xs={12} lg={6}>
            <Paper className="wireframe-card section-card">
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Recent Transactions
                </Typography>
                <Button variant="text" size="small">
                  View All
                </Button>
              </Box>

              <Box className="placeholder-box transaction-item-box" sx={{ mb: 2 }}>
                <Typography variant="body2">Transaction Description</Typography>
                <Typography variant="caption" color="text.secondary">Category • Date</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>$XX.XX</Typography>
              </Box>

              <Box className="placeholder-box transaction-item-box" sx={{ mb: 2 }}>
                <Typography variant="body2">Transaction Description</Typography>
                <Typography variant="caption" color="text.secondary">Category • Date</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>$XX.XX</Typography>
              </Box>

              <Box className="placeholder-box transaction-item-box">
                <Typography variant="body2">Transaction Description</Typography>
                <Typography variant="caption" color="text.secondary">Category • Date</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>$XX.XX</Typography>
              </Box>
            </Paper>
          </Grid>

        </Grid>

      </Container>

    </Box>
  )
}

export default Dashboard