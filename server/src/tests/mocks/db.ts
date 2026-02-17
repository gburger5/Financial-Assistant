import jwt from 'jsonwebtoken';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  created_at: string;
  updated_at: string;
}

const users: Map<string, User> = new Map();

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

export const mockDb = {
  // Clear all users
  clear: (): void => {
    users.clear();
  },

  // Register a new user
  registerUser: async (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ): Promise<Omit<User, 'password'>> => {
    const normalizedEmail = email.toLowerCase();

    // Check if user exists
    for (const user of users.values()) {
      if (user.email === normalizedEmail) {
        throw new Error('User already exists');
      }
    }

    // Validate email
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
    };

    users.set(newUser.id, newUser);

    // Return object without password
    return {
      id: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    };
  },

  // Login a user
  loginUser: async (
    email: string,
    password: string
  ): Promise<{ token: string; user: Omit<User, 'password'> }> => {
    const normalizedEmail = email.toLowerCase();

    const foundUser = Array.from(users.values()).find(u => u.email === normalizedEmail);

    if (!foundUser || foundUser.password !== password) {
      throw new Error('Invalid credentials');
    }

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

    // Return object without password
    return {
      token,
      user: {
        id: foundUser.id,
        firstName: foundUser.firstName,
        lastName: foundUser.lastName,
        email: foundUser.email,
        created_at: foundUser.created_at,
        updated_at: foundUser.updated_at,
      },
    };
  },
};