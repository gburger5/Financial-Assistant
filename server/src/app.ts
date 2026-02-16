import Fastify from "fastify";
import cors from "@fastify/cors";
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

  // Register CORS
  app.register(cors, {
    origin: true,
    credentials: true,
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

  // Register endpoint
  app.post<{ Body: RegisterBody }>("/register", async (req, reply) => {
    req.log.info({ email: req.body.email }, 'Register request received');
    
    const { firstName, lastName, email, password, confirmPassword } = req.body;
        
    if (password !== confirmPassword) {
      req.log.warn('Passwords do not match');
      return reply.status(400).send({ error: "Passwords do not match" });
    }

    if (!firstName || !lastName || !email || !password) {
      req.log.warn('Missing required fields');
      return reply.status(400).send({ error: "All fields are required" });
    }

    if (password.length < 6) {
      req.log.warn('Password too short');
      return reply.status(400).send({ error: "Password must be at least 6 characters" });
    }

    try {
      const user = await registerUser(firstName, lastName, email, password);
      req.log.info({ userId: user.id }, 'User registered successfully');
      return user;
    } catch (error) {
      req.log.error({ error }, 'Registration error');
      const message = error instanceof Error ? error.message : "Registration failed";
      return reply.status(400).send({ error: message });
    }
  });

  // Login endpoint
  app.post<{ Body: LoginBody }>("/login", async (req, reply) => {
    const { email, password } = req.body;
    
    try {
      const result = await loginUser(email, password);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return reply.status(401).send({ error: message });
    }
  });

  return app;
}