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
} from '@mui/material'
import {
  Person,
  Notifications,
  Settings,
} from '@mui/icons-material'
import './Dashboard.css'

function Dashboard() {
  const navigate = useNavigate()

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

        </Grid>

      </Container>

    </Box>
  )
}

export default Dashboard