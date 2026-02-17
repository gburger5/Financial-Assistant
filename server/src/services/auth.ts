import { db } from "../lib/db.js";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";

const TABLE = "users";
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

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

  const existing = await db.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "email-index",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": email.toLowerCase(),
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
    email: email.toLowerCase(),
    password_hash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

// LOGIN
export async function loginUser(email: string, password: string) {
  const result = await db.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "email-index",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": email.toLowerCase(),
    },
  }));

  const user = result.Items?.[0];
  if (!user) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { 
      userId: user.id, 
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Return token and user info
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