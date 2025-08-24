import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type SignupInput, type LoginInput } from '../schema';
import { 
  signup, 
  login, 
  logout, 
  getCurrentUser, 
  hashPassword, 
  verifyPassword, 
  createToken, 
  verifyToken 
} from '../handlers/auth';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key-here';

// Test inputs
const testSignupInput: SignupInput = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123'
};

const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('password utilities', () => {
    it('should hash password correctly', () => {
      const password = 'testpassword';
      const hashed = hashPassword(password);
      
      expect(hashed).not.toBe(password);
      expect(hashed.includes(':')).toBe(true); // Should contain salt separator
      expect(hashed.length).toBeGreaterThan(60); // Should be reasonably long
    });

    it('should verify password correctly', () => {
      const password = 'testpassword';
      const hashed = hashPassword(password);
      
      expect(verifyPassword(password, hashed)).toBe(true);
      expect(verifyPassword('wrongpassword', hashed)).toBe(false);
    });

    it('should create different hashes for same password', () => {
      const password = 'testpassword';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
      expect(verifyPassword(password, hash1)).toBe(true);
      expect(verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe('token utilities', () => {
    it('should create and verify token correctly', () => {
      const payload = { userId: 123, username: 'testuser' };
      const token = createToken(payload);
      
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3); // JWT-like format
      
      const decoded = verifyToken(token);
      expect(decoded).toEqual(payload);
    });

    it('should reject invalid tokens', () => {
      expect(verifyToken('invalid.token.format')).toBeNull();
      expect(verifyToken('invalid')).toBeNull();
      expect(verifyToken('')).toBeNull();
    });

    it('should reject tampered tokens', () => {
      const payload = { userId: 123, username: 'testuser' };
      const token = createToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      
      expect(verifyToken(tamperedToken)).toBeNull();
    });
  });

  describe('signup', () => {
    it('should create a new user successfully', async () => {
      const result = await signup(testSignupInput);

      expect(result.success).toBe(true);
      expect(result.message).toBe('User registered successfully');
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe('testuser');
      expect(result.user!.is_online).toBe(true);
      expect(result.token).toBeDefined();

      // Verify user was created in database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, testSignupInput.email))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].username).toBe('testuser');
      expect(users[0].email).toBe('test@example.com');
      expect(users[0].is_online).toBe(true);
    });

    it('should hash the password correctly', async () => {
      await signup(testSignupInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, testSignupInput.email))
        .execute();

      const user = users[0];
      
      // Password should be hashed, not plain text
      expect(user.password_hash).not.toBe(testSignupInput.password);
      
      // But should be verifiable with our crypto function
      const isValid = verifyPassword(testSignupInput.password, user.password_hash);
      expect(isValid).toBe(true);
    });

    it('should generate a valid token', async () => {
      const result = await signup(testSignupInput);

      expect(result.token).toBeDefined();
      
      // Verify token can be decoded
      const decoded = verifyToken(result.token!);
      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(result.user!.id);
      expect(decoded!.username).toBe('testuser');
    });

    it('should reject duplicate usernames', async () => {
      // Create first user
      await signup(testSignupInput);

      // Try to create another user with same username
      const duplicateInput: SignupInput = {
        username: 'testuser',
        email: 'different@example.com',
        password: 'password123'
      };

      const result = await signup(duplicateInput);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Username already exists');
      expect(result.user).toBeUndefined();
      expect(result.token).toBeUndefined();
    });

    it('should reject duplicate emails', async () => {
      // Create first user
      await signup(testSignupInput);

      // Try to create another user with same email
      const duplicateInput: SignupInput = {
        username: 'differentuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const result = await signup(duplicateInput);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email already exists');
      expect(result.user).toBeUndefined();
      expect(result.token).toBeUndefined();
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a user for login tests
      await signup(testSignupInput);
      
      // Set user offline for testing login status change
      await db.update(usersTable)
        .set({ is_online: false })
        .where(eq(usersTable.email, testSignupInput.email))
        .execute();
    });

    it('should login successfully with valid credentials', async () => {
      const result = await login(testLoginInput);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Login successful');
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe('testuser');
      expect(result.user!.is_online).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should update user online status and last_seen on login', async () => {
      const beforeLogin = new Date();
      await login(testLoginInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, testLoginInput.email))
        .execute();

      const user = users[0];
      expect(user.is_online).toBe(true);
      expect(user.last_seen).toBeInstanceOf(Date);
      expect(user.last_seen!.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });

    it('should reject invalid email', async () => {
      const invalidInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const result = await login(invalidInput);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid email or password');
      expect(result.user).toBeUndefined();
      expect(result.token).toBeUndefined();
    });

    it('should reject invalid password', async () => {
      const invalidInput: LoginInput = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const result = await login(invalidInput);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid email or password');
      expect(result.user).toBeUndefined();
      expect(result.token).toBeUndefined();
    });

    it('should generate a valid token on login', async () => {
      const result = await login(testLoginInput);

      expect(result.token).toBeDefined();
      
      const decoded = verifyToken(result.token!);
      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(result.user!.id);
      expect(decoded!.username).toBe('testuser');
    });
  });

  describe('logout', () => {
    let userId: number;

    beforeEach(async () => {
      const signupResult = await signup(testSignupInput);
      userId = signupResult.user!.id;
    });

    it('should logout user successfully', async () => {
      const result = await logout(userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logout successful');
    });

    it('should update user status to offline and set last_seen', async () => {
      const beforeLogout = new Date();
      await logout(userId);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      const user = users[0];
      expect(user.is_online).toBe(false);
      expect(user.last_seen).toBeInstanceOf(Date);
      expect(user.last_seen!.getTime()).toBeGreaterThanOrEqual(beforeLogout.getTime());
    });

    it('should handle logout for non-existent user', async () => {
      const result = await logout(99999);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logout successful');
    });
  });

  describe('getCurrentUser', () => {
    let userId: number;

    beforeEach(async () => {
      const signupResult = await signup(testSignupInput);
      userId = signupResult.user!.id;
    });

    it('should return public user data', async () => {
      const result = await getCurrentUser(userId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(userId);
      expect(result!.username).toBe('testuser');
      expect(result!.is_online).toBe(true);
      expect(result!.avatar_url).toBeNull();
      expect(result!.last_seen).toBeDefined();
    });

    it('should return null for non-existent user', async () => {
      const result = await getCurrentUser(99999);

      expect(result).toBeNull();
    });

    it('should not return sensitive data', async () => {
      const result = await getCurrentUser(userId);

      expect(result).toBeDefined();
      
      // Should not have password_hash or email
      expect((result as any).password_hash).toBeUndefined();
      expect((result as any).email).toBeUndefined();
      expect((result as any).created_at).toBeUndefined();
      expect((result as any).updated_at).toBeUndefined();
    });
  });
});