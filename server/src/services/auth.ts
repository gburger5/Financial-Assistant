import { db } from "../lib/db.js";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";

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
  };

  await db.send(new PutCommand({
    TableName: TABLE,
    Item: user,
  }));

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
    throw new Error("Invalid credentials");
  }

  // Check if account is locked
  if (user.accountLockedUntil) {
    const lockoutEnd = new Date(user.accountLockedUntil);
    if (new Date() < lockoutEnd) {
      const minutesLeft = Math.ceil((lockoutEnd.getTime() - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
    }
    // Lockout expired, reset counter
    await db.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: user.id },
      UpdateExpression: "SET failedLoginAttempts = :zero, accountLockedUntil = :null",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":null": null,
      },
    }));
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  
  if (!valid) {
    // Increment failed attempts
    const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
    const updateParams: UpdateParams = {
      TableName: TABLE,
      Key: { id: user.id },
      UpdateExpression: "SET failedLoginAttempts = :attempts, updated_at = :now",
      ExpressionAttributeValues: {
        ":attempts": newFailedAttempts,
        ":now": new Date().toISOString(),
      },
    };

    // Lock account after 5 failed attempts
    if (newFailedAttempts >= 5) {
      const lockoutEnd = new Date();
      lockoutEnd.setMinutes(lockoutEnd.getMinutes() + 15);
      updateParams.UpdateExpression += ", accountLockedUntil = :lockout";
      updateParams.ExpressionAttributeValues[":lockout"] = lockoutEnd.toISOString();
    }

    await db.send(new UpdateCommand(updateParams));

    if (newFailedAttempts >= 5) {
      throw new Error("Account locked due to too many failed attempts. Try again in 15 minutes.");
    }
    
    throw new Error("Invalid credentials");
  }

  // Reset failed attempts on successful login
  if (user.failedLoginAttempts > 0) {
    await db.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: user.id },
      UpdateExpression: "SET failedLoginAttempts = :zero, accountLockedUntil = :null",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":null": null,
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

interface UpdateParams {
  TableName: string;
  Key: { id: string };
  UpdateExpression: string;
  ExpressionAttributeValues: Record<string, string | number | null>;
}