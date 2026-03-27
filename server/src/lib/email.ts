/**
 * @module email
 * @description This module provides functions to send transactional emails using Brevo.
 * It includes functions to send verification emails and password reset emails to users.
 *
 * To use this module, ensure you have the following environment variables set:
 * - BREVO_API_KEY: Your Brevo API key for authentication.
 * - EMAIL_FROM: The email address from which the emails will be sent.
 * - EMAIL_FROM_NAME: The name that will appear as the sender of the emails.
 * - FRONTEND_URL: The base URL of your frontend application, used to construct links.
 */
import { BrevoClient, BrevoEnvironment } from "@getbrevo/brevo";

const client = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY!,
  environment: BrevoEnvironment.Default,
});

/**
 * Sends an email verification link to a newly registered user.
 *
 * @param {string} email - Recipient email address.
 * @param {string} token - Raw (unhashed) verification token to embed in the link.
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;

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

/**
 * Notifies a user that their password was successfully changed.
 * Sent after both the authenticated password-change flow and the
 * forgot-password reset flow so the user can detect unauthorized changes.
 *
 * @param {string} email - Recipient email address.
 * @returns {Promise<void>}
 */
export async function sendPasswordChangedEmail(email: string): Promise<void> {
  await client.transactionalEmails.sendTransacEmail({
    to: [{ email }],
    sender: {
      email: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME,
    },
    subject: "Your password was changed",
    htmlContent: `
      <h2>Password changed</h2>
      <p>The password for your account was just changed.</p>
      <p>If you made this change, no action is needed.</p>
      <p>If you did not make this change, reset your password immediately using the link on the login page.</p>
    `,
  });
}

/**
 * Notifies a user that their account has been permanently deleted.
 * Sent immediately before the user record is removed so the email
 * address is still available to the caller.
 *
 * @param {string} email - Recipient email address.
 * @returns {Promise<void>}
 */
export async function sendAccountDeletedEmail(email: string): Promise<void> {
  await client.transactionalEmails.sendTransacEmail({
    to: [{ email }],
    sender: {
      email: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME,
    },
    subject: "Your account has been deleted",
    htmlContent: `
      <h2>Account deleted</h2>
      <p>Your account and all associated data have been permanently deleted.</p>
      <p>If you did not request this, please contact support immediately.</p>
    `,
  });
}

/**
 * Sends a password-reset link to a user who requested a password reset.
 * The raw token is embedded in the link; only its hash is stored server-side.
 *
 * @param {string} email - Recipient email address.
 * @param {string} token - Raw (unhashed) reset token to embed in the link.
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

  await client.transactionalEmails.sendTransacEmail({
    to: [{ email }],
    sender: {
      email: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME,
    },
    subject: "Reset your password",
    htmlContent: `
      <h2>Reset your password</h2>
      <p>Click the link below to set a new password for your account:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link expires in 60 minutes.</p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
    `,
  });
}