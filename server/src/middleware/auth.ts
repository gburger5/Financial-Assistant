import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = process.env.JWT_SECRET;

interface JWTPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Extend Fastify's request type to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function verifyToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}