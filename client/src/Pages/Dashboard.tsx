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


    </Box>
  )
}

export default Dashboard