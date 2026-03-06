/**
 * @module email
 * @description This module provides functions to send transactional emails using Brevo.
 * It includes a function to send verification emails to users.
 * 
 * To use this module, ensure you have the following environment variables set:
 * - BREVO_API_KEY: Your Brevo API key for authentication.
 * - EMAIL_FROM: The email address from which the emails will be sent.
 * - EMAIL_FROM_NAME: The name that will appear as the sender of the emails.
 * - FRONTEND_URL: The base URL of your frontend application, used to construct the verification link.
 * Example usage:
 * 
 * import { sendVerificationEmail } from './email';
 * 
 * const userEmail = 'user@example.com';
 * const userToken = 'your_verification_token';
 * await sendVerificationEmail(userEmail, userToken);
 * }
 */
import { BrevoClient, BrevoEnvironment } from "@getbrevo/brevo";

const client = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY!,
  environment: BrevoEnvironment.Default,
});

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  await client.transactionalEmails.sendTransacEmail({
    to: [{ email }],
    sender: {
      email: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME,
    },
    subject: "Verify your email",
    htmlContent: `
      <h2>Verify your email</h2>
      <p>Click the link below to verify your account:</p>
      <a href="${verifyUrl}">${verifyUrl}</a>
      <p>This link expires in 24 hours.</p>
    `,
  });
}