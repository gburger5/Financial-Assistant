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
  //Checkbox,
  //FormControlLabel,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  EmailOutlined,
  LockOutlined,
  PersonOutline,
} from '@mui/icons-material'
import './SignUp.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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
  const [loading, setLoading] = useState(false)

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [field]: e.target.value })
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const { firstName, lastName, email, password, confirmPassword } = formData

    if (!firstName || !lastName || !email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (!email.includes('@') && !email.includes('.com')) {
      setError('Please put a valid email address')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /\d/.test(password)

    if (!hasUpper || !hasLower || !hasNumber) {
      setError('Password must contain uppercase, lowercase, and number')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
        try {
        // Step 1: Register
        const registerRes = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, password, confirmPassword }),
        })

        const registerData = await registerRes.json()

        if (!registerRes.ok) {
            setError(registerData.error || 'Registration failed. Please try again.')
            return
        }

        // Step 2: Auto-login
        const loginRes = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        })

        const loginData = await loginRes.json()

        if (!loginRes.ok) {
            // Registration succeeded but auto-login failed, send to login page
            navigate('/login')
            return
        }

        localStorage.setItem('token', loginData.token)

        sessionStorage.setItem('onboarding_firstName', firstName)
        sessionStorage.setItem('onboarding_lastName', lastName)
        
        navigate('/onboarding')
        } catch {
        setError('Unable to connect to server. Please try again.')
        } finally {
        setLoading(false)
        }
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
                <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6}>
                    <TextField
                    fullWidth
                    label="First Name"
                    value={formData.firstName}
                    onChange={handleChange('firstName')}
                    InputProps={{
                        startAdornment: (
                        <InputAdornment position="start">
                            <PersonOutline color="action" />
                        </InputAdornment>
                        ),
                    }}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                    fullWidth
                    label="Last Name"
                    value={formData.lastName}
                    onChange={handleChange('lastName')}
                    InputProps={{
                        startAdornment: (
                        <InputAdornment position="start">
                            <PersonOutline color="action" />
                        </InputAdornment>
                        ),
                    }}
                    />
                </Grid>

                <Grid item xs={12}>
                    <TextField
                    fullWidth
                    label="Email Address"
                    type="email"
                    value={formData.email}
                    onChange={handleChange('email')}
                    InputProps={{
                        startAdornment: (
                        <InputAdornment position="start">
                            <EmailOutlined color="action" />
                        </InputAdornment>
                        ),
                    }}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                    fullWidth
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange('password')}
                    InputProps={{
                        startAdornment: (
                        <InputAdornment position="start">
                            <LockOutlined color="action" />
                        </InputAdornment>
                        ),
                        endAdornment: (
                        <InputAdornment position="end">
                            <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                        </InputAdornment>
                        ),
                    }}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                    fullWidth
                    label="Confirm Password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange('confirmPassword')}
                    InputProps={{
                        startAdornment: (
                        <InputAdornment position="start">
                            <LockOutlined color="action" />
                        </InputAdornment>
                        ),
                        endAdornment: (
                        <InputAdornment position="end">
                            <IconButton
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            edge="end"
                            >
                            {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                        </InputAdornment>
                        ),
                    }}
                    />
                </Grid>
                </Grid>

                    <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    size="large"
                    className="signup-button"
                    disabled={loading}
                    sx={{ mt: 3 }}
                    >
                    {loading ? 'Creating Account...' : 'Create Account'}
                    </Button>

                    <Divider sx={{ my: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                        OR
                    </Typography>
                    </Divider>

                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            Already have an account?{' '}
                            <Link
                            onClick={() => navigate('/login')}
                            sx={{
                                color: 'secondary.main',
                                cursor: 'pointer',
                                fontWeight: 600,
                                textDecoration: 'none',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                            >
                                Sign In
                            </Link>
                        </Typography>
                    </Box>
                </Box>
            </Paper>
        </Container>
    </Box>
  )
}

export default SignUp