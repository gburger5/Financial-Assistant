import jwt from 'jsonwebtoken';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  created_at: string;
  updated_at: string;
  failedLoginAttempts: number;
  accountLockedUntil: string | null;
}

const users: Map<string, User> = new Map();

// Test environment always uses fallback
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

export const mockDb = {
  clear: (): void => {
    users.clear();
  },

  registerUser: async (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ): Promise<Omit<User, 'password'>> => {
    const normalizedEmail = email.toLowerCase();

    for (const user of users.values()) {
      if (user.email === normalizedEmail) {
        throw new Error('User already exists');
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    const newUser: User = {
      id: `user-${Date.now()}-${Math.random()}`,
      firstName,
      lastName,
      email: normalizedEmail,
      password,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      failedLoginAttempts: 0,
      accountLockedUntil: null,
    };

    users.set(newUser.id, newUser);

    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  },

  loginUser: async (
    email: string,
    password: string
  ): Promise<{ token: string; user: Omit<User, 'password'> }> => {
    const normalizedEmail = email.toLowerCase();
    const foundUser = Array.from(users.values()).find(u => u.email === normalizedEmail);

    if (!foundUser) {
      throw new Error('Invalid email or password');
    }

    // Check account lockout
    if (foundUser.accountLockedUntil) {
      const lockoutEnd = new Date(foundUser.accountLockedUntil);
      if (new Date() < lockoutEnd) {
        const minutesLeft = Math.ceil((lockoutEnd.getTime() - Date.now()) / 60000);
        throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
      }
      foundUser.failedLoginAttempts = 0;
      foundUser.accountLockedUntil = null;
    }

    if (foundUser.password !== password) {
      foundUser.failedLoginAttempts += 1;
      const shouldLock = foundUser.failedLoginAttempts >= 5;

      if (shouldLock) {
        const lockoutEnd = new Date();
        lockoutEnd.setMinutes(lockoutEnd.getMinutes() + 15);
        foundUser.accountLockedUntil = lockoutEnd.toISOString();
        throw new Error('Account locked due to too many failed attempts. Try again in 15 minutes.');
      }

      const remaining = 5 - foundUser.failedLoginAttempts;
      throw new Error(`Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    // Reset on success
    foundUser.failedLoginAttempts = 0;
    foundUser.accountLockedUntil = null;

    const token = jwt.sign(
      {
        userId: foundUser.id,
        email: foundUser.email,
        firstName: foundUser.firstName,
        lastName: foundUser.lastName,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = foundUser;
    return { token, user: userWithoutPassword };
  },
};