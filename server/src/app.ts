import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerUser, loginUser } from "./services/auth.js";
import { verifyToken } from "./middleware/auth.js";
import plaidRoutes from "./routes/plaid.js";
import budgetRoutes from "./routes/budget.js";
import { db } from "./lib/db.js";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LIMITS } from "./validation.js";

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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
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

  // Logout endpoint that revokes current session
  app.post("/logout", { preHandler: verifyToken }, async (req, reply) => {
    try {
      const user = req.user!;

      await db.send(new UpdateCommand({
        TableName: "auth_tokens",
        Key: { tokenId: user.jti },

        UpdateExpression: "SET revoked = :true, revokedAt = :now",

        // Only allow update if session actually exists
        ConditionExpression: "attribute_exists(tokenId)",

        ExpressionAttributeValues: {
          ":true": true,
          ":now": new Date().toISOString()
        }
      }));

      req.log.info({ userId: user.userId, tokenId: user.jti }, "User logged out");

      return reply.send({ success: true });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        return reply.send({ success: true });
      }

      req.log.error({ error }, "Logout failed");
      return reply.status(500).send({ error: "Logout failed" });
    }
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

  // Required fields
  if (!firstName || !lastName || !email || !password) {
    return reply.status(400).send({ error: "All fields are required" });
  }

  // First name length
  if (
    firstName.length < LIMITS.firstName.min ||
    firstName.length > LIMITS.firstName.max
  ) {
    return reply.status(400).send({
      error: `First name must be between ${LIMITS.firstName.min} and ${LIMITS.firstName.max} characters`
    });
  }

  // Last name length
  if (
    lastName.length < LIMITS.lastName.min ||
    lastName.length > LIMITS.lastName.max
  ) {
    return reply.status(400).send({
      error: `Last name must be between ${LIMITS.lastName.min} and ${LIMITS.lastName.max} characters`
    });
  }

  // Email max length
  if (email.length > LIMITS.email.max) {
    return reply.status(400).send({
      error: `Email must not exceed ${LIMITS.email.max} characters`
    });
  }

  // Password min/max length
  if (
    password.length < LIMITS.password.min ||
    password.length > LIMITS.password.max
  ) {
    return reply.status(400).send({
      error: `Password must be between ${LIMITS.password.min} and ${LIMITS.password.max} characters`
    });
  }

  // Password complexity checks
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (!hasUpper || !hasLower || !hasNumber) {
    return reply.status(400).send({
      error: "Password must contain uppercase, lowercase, and number"
    });
  }

  // Confirm password
  if (password !== confirmPassword) {
    return reply.status(400).send({ error: "Passwords do not match" });
  }

  try {
        const user = await registerUser(firstName, lastName, email, password);
        req.log.info({ userId: user.id }, 'User registered successfully');
        return reply.status(200).send({ user });
      } catch (error) {
        req.log.error({ error }, 'Registration error');
        const message = error instanceof Error ? error.message : "Registration failed";
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid email or password";
        req.log.warn({ email }, 'Login attempt failed');
        return reply.status(401).send({ error: message });
      }
    });

  app.register(plaidRoutes);
  app.register(budgetRoutes);

  return app;
}
