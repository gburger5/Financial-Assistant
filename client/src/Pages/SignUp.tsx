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

    if (!formData.email.includes('@') && !formData.email.includes('.com')) {
        setError('Please put a valid email address')
        return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
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
                    sx={{ mt: 3 }}
                    >
                    Create Account
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
