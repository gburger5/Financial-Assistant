import { Routes, Route } from 'react-router-dom'
import Login from './Pages/Login'
import SignUp from './Pages/SignUp'
import Dashboard from './Pages/Dashboard'
import Landing from './Pages/Landing'
import Onboarding from './Pages/Onboarding'


function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={<Landing />} />
    </Routes>
  )
}

export default App
