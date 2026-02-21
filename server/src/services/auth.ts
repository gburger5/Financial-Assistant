import { db } from "../lib/db.js";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { createEmptyBudget } from "./budget.js";

const TABLE = "users";

// Only allow fallback in non-production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("JWT_SECRET must be set in production environment");
  }
  console.warn('Warning: Using fallback JWT_SECRET for non-production environment');
}
const SECRET = JWT_SECRET || 'test-secret-key';

export async function registerUser(
  firstName: string,
  lastName: string,
  email: string,
  password: string
) {
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }

  const normalizedEmail = email.toLowerCase();

  const existing = await db.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "email-index",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": normalizedEmail,
    },
  }));

  if (existing.Items?.length) {
    throw new Error("User already exists");
  }

  const password_hash = await bcrypt.hash(password, 10);

  const user = {
    id: uuid(),
    firstName,
    lastName,
    email: normalizedEmail,
    password_hash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    failedLoginAttempts: 0,
    accountLockedUntil: null,
    plaidItems: [],
    onboarding: {
      plaidLinked: false,
      budgetAnalyzed: false,
      budgetConfirmed: false,
    },
  };

  await db.send(new PutCommand({
    TableName: TABLE,
    Item: user,
  }));

  await createEmptyBudget(user.id);

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email
  };
}

// Login with account lockout
export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.toLowerCase();
  
  const result = await db.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "email-index",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": normalizedEmail,
    },
  }));

  const user = result.Items?.[0];
  if (!user) {
    throw new Error("Invalid email or password");
  }

  // Check if account is locked
  if (user.accountLockedUntil) {
    const lockoutEnd = new Date(user.accountLockedUntil);
    if (new Date() < lockoutEnd) {
      const minutesLeft = Math.ceil((lockoutEnd.getTime() - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
    }
    // Lockout expired, reset
    await db.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: user.id },
      UpdateExpression: "SET failedLoginAttempts = :zero, accountLockedUntil = :null, updated_at = :now",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":null": null,
        ":now": new Date().toISOString(),
      },
    }));
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  
  if (!valid) {
    const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
    const shouldLock = newFailedAttempts >= 5;
    const lockoutEnd = new Date();
    lockoutEnd.setMinutes(lockoutEnd.getMinutes() + 15);

    await db.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: user.id },
      UpdateExpression: shouldLock
        ? "SET failedLoginAttempts = :attempts, accountLockedUntil = :lockout, updated_at = :now"
        : "SET failedLoginAttempts = :attempts, updated_at = :now",
      ExpressionAttributeValues: shouldLock ? {
        ":attempts": newFailedAttempts,
        ":lockout": lockoutEnd.toISOString(),
        ":now": new Date().toISOString(),
      } : {
        ":attempts": newFailedAttempts,
        ":now": new Date().toISOString(),
      },
    }));

    // Throw lockout message immediately on 5th attempt
    if (shouldLock) {
      throw new Error("Account locked due to too many failed attempts. Try again in 15 minutes.");
    }

    const remaining = 5 - newFailedAttempts;
    throw new Error(`Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
  }

  // Reset on successful login
  if ((user.failedLoginAttempts || 0) > 0) {
    await db.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: user.id },
      UpdateExpression: "SET failedLoginAttempts = :zero, accountLockedUntil = :null, updated_at = :now",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":null": null,
        ":now": new Date().toISOString(),
      },
    }));
  }

  const token = jwt.sign(
    { 
      userId: user.id, 
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    },
    SECRET,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    }
  };
}

export async function getUserById(userId: string) {
  const result = await db.send(new GetCommand({
    TableName: TABLE,
    Key: { id: userId },
  }));
  return result.Item ?? null;
}