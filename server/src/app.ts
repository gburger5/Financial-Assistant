import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerUser, loginUser } from "./services/auth.js";
import { verifyToken } from "./middleware/auth.js";

interface RegisterBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export function buildApp() {
  const app = Fastify({ logger: true });

  // Restrict CORS to specific origin
  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.register(cors, {
    origin: allowedOrigin,
    credentials: true,
  });

  // Rate limiting
  app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    cache: 10000,
  });

  // Health endpoint
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Verify token endpoint
  app.get("/verify", { preHandler: verifyToken }, async (req) => {
    return {
      valid: true,
      user: req.user
    };
  });

  // Register endpoint with rate limit and lockout tracking
  app.post<{ Body: RegisterBody }>("/register", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes'
      }
    }
  }, async (req, reply) => {
    req.log.info({ email: req.body.email }, 'Register request received');
    
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    
    // Validation
    if (!firstName || !lastName || !email || !password) {
      req.log.warn('Missing required fields');
      return reply.status(400).send({ error: "All fields are required" });
    }
        
    if (password !== confirmPassword) {
      req.log.warn('Passwords do not match');
      return reply.status(400).send({ error: "Passwords do not match" });
    }

    if (password.length < 8) {
      req.log.warn('Password too short');
      return reply.status(400).send({ 
        error: "Password must be at least 8 characters" 
      });
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    
    if (!hasUpper || !hasLower || !hasNumber) {
      req.log.warn('Password does not meet complexity requirements');
      return reply.status(400).send({ 
        error: "Password must contain uppercase, lowercase, and number" 
      });
    }

    try {
      const user = await registerUser(firstName, lastName, email, password);
      req.log.info({ userId: user.id }, 'User registered successfully');
      
      // Don't reveal if user exists
      return reply.status(200).send({
        message: "Registration successful. Please check your email to verify your account.",
        user
      });
    } catch (error) {
      req.log.error({ error }, 'Registration error');
      const message = error instanceof Error ? error.message : "Registration failed";
      
      // Generic error message for duplicate email
      if (message === "User already exists") {
        return reply.status(200).send({ 
          message: "If this email is not already registered, you will receive a verification email shortly." 
        });
      }
      
      return reply.status(400).send({ error: message });
    }
  });

  // Login endpoint with strict limit and account lockout
  app.post<{ Body: LoginBody }>("/login", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes'
      }
    }
  }, async (req, reply) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }
    
    try {
      const result = await loginUser(email, password);
      return result;
    } catch {
      req.log.warn({ email }, 'Login attempt failed');
      return reply.status(401).send({ 
        error: "Invalid email or password" 
      });
    }
  });

  return app;
}