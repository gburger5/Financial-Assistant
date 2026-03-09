/**
 * @module email.test
 * @description Unit tests for the email lib module.
 * The Brevo client is fully mocked — no real HTTP calls are made.
 * Tests verify that the correct recipient, sender, subject, and link are
 * assembled for each email type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @getbrevo/brevo before importing the module under test.
// vi.fn() produces an arrow function which cannot be used with `new`.
// We must use a plain `function` declaration so it qualifies as a constructor.
// ---------------------------------------------------------------------------

const { mockSendTransacEmail } = vi.hoisted(() => ({
  mockSendTransacEmail: vi.fn(),
}));

vi.mock('@getbrevo/brevo', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BrevoClient: function (this: any) {
    this.transactionalEmails = {
      sendTransacEmail: mockSendTransacEmail,
    };
  },
  BrevoEnvironment: { Default: 'default' },
}));

import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js';

// ---------------------------------------------------------------------------
// Shared env setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSendTransacEmail.mockResolvedValue({});
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.EMAIL_FROM = 'noreply@example.com';
  process.env.EMAIL_FROM_NAME = 'TestApp';
  process.env.FRONTEND_URL = 'https://app.example.com';
});

// ---------------------------------------------------------------------------
// sendVerificationEmail
// ---------------------------------------------------------------------------

describe('sendVerificationEmail', () => {
  it('calls sendTransacEmail once', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);
  });

  it('sends to the correct recipient', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    const call = mockSendTransacEmail.mock.calls[0][0];
    expect(call.to).toEqual([{ email: 'alice@example.com' }]);
  });

  it('uses the EMAIL_FROM and EMAIL_FROM_NAME env vars as the sender', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    const { sender } = mockSendTransacEmail.mock.calls[0][0];
    expect(sender.email).toBe('noreply@example.com');
    expect(sender.name).toBe('TestApp');
  });

  it('sets the subject to "Verify your email"', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    const { subject } = mockSendTransacEmail.mock.calls[0][0];
    expect(subject).toBe('Verify your email');
  });

  it('embeds the raw token in the verification URL', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toContain('raw-token-abc');
  });

  it('constructs the link using FRONTEND_URL and the /verify-email path', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toContain(
      'https://app.example.com/verify-email?token=raw-token-abc',
    );
  });

  it('mentions that the link expires in 24 hours', async () => {
    await sendVerificationEmail('alice@example.com', 'raw-token-abc');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toMatch(/24 hours/i);
  });

  it('returns undefined on success (fire-and-forget callers need no return value)', async () => {
    const result = await sendVerificationEmail('alice@example.com', 'raw-token-abc');
    expect(result).toBeUndefined();
  });

  it('propagates errors thrown by the Brevo client', async () => {
    mockSendTransacEmail.mockRejectedValue(new Error('Brevo API error'));

    await expect(sendVerificationEmail('alice@example.com', 'tok')).rejects.toThrow(
      'Brevo API error',
    );
  });

  it('uses a different URL when FRONTEND_URL changes', async () => {
    process.env.FRONTEND_URL = 'https://staging.example.com';

    await sendVerificationEmail('alice@example.com', 'tok-xyz');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toContain(
      'https://staging.example.com/verify-email?token=tok-xyz',
    );
  });
});

// ---------------------------------------------------------------------------
// sendPasswordResetEmail
// ---------------------------------------------------------------------------

describe('sendPasswordResetEmail', () => {
  it('calls sendTransacEmail once', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);
  });

  it('sends to the correct recipient', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const call = mockSendTransacEmail.mock.calls[0][0];
    expect(call.to).toEqual([{ email: 'alice@example.com' }]);
  });

  it('uses the EMAIL_FROM and EMAIL_FROM_NAME env vars as the sender', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const { sender } = mockSendTransacEmail.mock.calls[0][0];
    expect(sender.email).toBe('noreply@example.com');
    expect(sender.name).toBe('TestApp');
  });

  it('sets the subject to "Reset your password"', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const { subject } = mockSendTransacEmail.mock.calls[0][0];
    expect(subject).toBe('Reset your password');
  });

  it('embeds the raw token in the reset URL', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toContain('reset-token-xyz');
  });

  it('constructs the link using FRONTEND_URL and the /reset-password path', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toContain(
      'https://app.example.com/reset-password?token=reset-token-xyz',
    );
  });

  it('mentions that the link expires in 60 minutes', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toMatch(/60 minutes/i);
  });

  it('includes a note that the user can ignore the email if they did not request a reset', async () => {
    await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toMatch(/did not request/i);
  });

  it('returns undefined on success', async () => {
    const result = await sendPasswordResetEmail('alice@example.com', 'reset-token-xyz');
    expect(result).toBeUndefined();
  });

  it('propagates errors thrown by the Brevo client', async () => {
    mockSendTransacEmail.mockRejectedValue(new Error('Network timeout'));

    await expect(sendPasswordResetEmail('alice@example.com', 'tok')).rejects.toThrow(
      'Network timeout',
    );
  });

  it('uses a different URL when FRONTEND_URL changes', async () => {
    process.env.FRONTEND_URL = 'https://staging.example.com';

    await sendPasswordResetEmail('alice@example.com', 'reset-tok');

    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).toContain(
      'https://staging.example.com/reset-password?token=reset-tok',
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-function isolation
// ---------------------------------------------------------------------------

describe('sendVerificationEmail and sendPasswordResetEmail isolation', () => {
  it('calling one does not affect the other', async () => {
    await sendVerificationEmail('alice@example.com', 'verify-tok');
    await sendPasswordResetEmail('bob@example.com', 'reset-tok');

    expect(mockSendTransacEmail).toHaveBeenCalledTimes(2);

    const firstCall = mockSendTransacEmail.mock.calls[0][0];
    const secondCall = mockSendTransacEmail.mock.calls[1][0];

    expect(firstCall.to).toEqual([{ email: 'alice@example.com' }]);
    expect(secondCall.to).toEqual([{ email: 'bob@example.com' }]);
    expect(firstCall.subject).toBe('Verify your email');
    expect(secondCall.subject).toBe('Reset your password');
  });

  it('verification email does not contain /reset-password path', async () => {
    await sendVerificationEmail('alice@example.com', 'tok');
    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).not.toContain('/reset-password');
  });

  it('reset email does not contain /verify-email path', async () => {
    await sendPasswordResetEmail('alice@example.com', 'tok');
    const { htmlContent } = mockSendTransacEmail.mock.calls[0][0];
    expect(htmlContent).not.toContain('/verify-email');
  });
});