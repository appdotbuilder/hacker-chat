import { db } from '../db';
import { usersTable } from '../db/schema';
import { type SignupInput, type LoginInput, type AuthResponse, type PublicUser } from '../schema';
import { eq, or } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key-here';
const SALT_LENGTH = 32;
const ITERATIONS = 10000;
const KEY_LENGTH = 64;

// Simple password hashing using PBKDF2
function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256').toString('hex');
  return hash === verifyHash;
}

// Simple JWT-like token creation using HMAC
function createToken(payload: { userId: number; username: string }): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = createHash('sha256').update(`${header}.${body}.${JWT_SECRET}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): { userId: number; username: string } | null {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSignature = createHash('sha256').update(`${header}.${body}.${JWT_SECRET}`).digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    
    if (payload.exp < Date.now()) {
      return null;
    }
    
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

export async function signup(input: SignupInput): Promise<AuthResponse> {
  try {
    // Check if username or email already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(or(
        eq(usersTable.username, input.username),
        eq(usersTable.email, input.email)
      ))
      .execute();

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.username === input.username) {
        return {
          success: false,
          message: 'Username already exists'
        };
      }
      if (existingUser.email === input.email) {
        return {
          success: false,
          message: 'Email already exists'
        };
      }
    }

    // Hash password
    const passwordHash = hashPassword(input.password);

    // Create new user
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        email: input.email,
        password_hash: passwordHash,
        is_online: true
      })
      .returning()
      .execute();

    const newUser = result[0];

    // Generate token
    const token = createToken({
      userId: newUser.id,
      username: newUser.username
    });

    // Return success response with public user data
    return {
      success: true,
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        avatar_url: newUser.avatar_url,
        is_online: newUser.is_online,
        last_seen: newUser.last_seen
      },
      token
    };
  } catch (error) {
    console.error('Signup failed:', error);
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      return {
        success: false,
        message: 'Invalid email or password'
      };
    }

    const user = users[0];

    // Verify password
    const passwordValid = verifyPassword(input.password, user.password_hash);
    if (!passwordValid) {
      return {
        success: false,
        message: 'Invalid email or password'
      };
    }

    // Update user's online status and last_seen
    const updatedUsers = await db.update(usersTable)
      .set({
        is_online: true,
        last_seen: new Date(),
        updated_at: new Date()
      })
      .where(eq(usersTable.id, user.id))
      .returning()
      .execute();

    const updatedUser = updatedUsers[0];

    // Generate token
    const token = createToken({
      userId: user.id,
      username: user.username
    });

    return {
      success: true,
      message: 'Login successful',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        avatar_url: updatedUser.avatar_url,
        is_online: updatedUser.is_online,
        last_seen: updatedUser.last_seen
      },
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function logout(userId: number): Promise<{ success: boolean; message: string }> {
  try {
    // Update user's online status to false and set last_seen
    await db.update(usersTable)
      .set({
        is_online: false,
        last_seen: new Date(),
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .execute();

    return {
      success: true,
      message: 'Logout successful'
    };
  } catch (error) {
    console.error('Logout failed:', error);
    throw error;
  }
}

export async function getCurrentUser(userId: number): Promise<PublicUser | null> {
  try {
    const users = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      avatar_url: usersTable.avatar_url,
      is_online: usersTable.is_online,
      last_seen: usersTable.last_seen
    })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return null;
    }

    return users[0];
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
}

// Export utility functions for testing
export { hashPassword, verifyPassword, createToken, verifyToken };