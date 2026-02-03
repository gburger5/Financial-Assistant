import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  InputAdornment,
  IconButton,
  Divider,
  Link,
  Alert,
  Grid,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  EmailOutlined,
  LockOutlined,
  PersonOutline,
} from '@mui/icons-material'
import './SignUp.css'

function SignUp() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [field]: e.target.value })
  }

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError('Please fill in all fields')
      return
    }

    if (!formData.email.includes('@') || !formData.email.includes('.com')) {
        setError('Please put a valid email address')
        return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    navigate('/dashboard')
  }

  return (
    <Box className="signup-container">
      <Box className="signup-background">
        <Box className="gradient-orb orb-1" />
        <Box className="gradient-orb orb-2" />
        <Box className="gradient-orb orb-3" />
      </Box>

      <Container maxWidth="md">
        <Paper elevation={0} className="signup-paper">
          <Box className="signup-header">
            <Box className="logo-container">
              <Box className="logo-icon" />
              <Typography variant="h4" component="h1" className="logo-text">
                FinanceAI
              </Typography>
            </Box>
            <Typography variant="h5" component="h2" className="welcome-text">
              Create Your Account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Start your journey to smarter financial decisions
            </Typography>
          </Box>

            <Box component="form" onSubmit={handleSignUp} className="signup-form">
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

        </Box>
        </Paper>
      </Container>
    </Box>
  )
}

export default SignUp
