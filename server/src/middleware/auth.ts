import { db } from "../lib/db.js";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// Only allow fallback in non-production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("JWT_SECRET must be set in production environment");
  }
}
const SECRET = JWT_SECRET || 'test-secret-key';
const AUTH_TOKENS_TABLE = "auth_tokens";

interface JWTPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  jti: string;
}

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

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, SECRET) as JWTPayload;

    // Check if this token session still exists
    const record = await db.send(new GetCommand({
      TableName: AUTH_TOKENS_TABLE,
      Key: { tokenId: decoded.jti }
    }));

    // Reject if token not found or revoked or expired
    if (!record.Item) {
      return reply.status(401).send({ error: "Session not found" });
    }

    if (record.Item.revoked === true) {
      return reply.status(401).send({ error: "Session revoked" });
    }

    if (record.Item.expiresAt && record.Item.expiresAt < Math.floor(Date.now() / 1000)) {
      return reply.status(401).send({ error: "Session expired" });
    }

    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}