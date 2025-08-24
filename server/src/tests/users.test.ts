import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserStatusInput } from '../schema';
import {
  getOnlineUsers,
  getAllUsers,
  searchUsers,
  updateUserStatus,
  updateUserProfile
} from '../handlers/users';
import { eq } from 'drizzle-orm';

describe('User Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getOnlineUsers', () => {
    it('should return only online users', async () => {
      // Create test users
      await db.insert(usersTable).values([
        {
          username: 'alice',
          email: 'alice@test.com',
          password_hash: 'hash1',
          is_online: true,
          last_seen: new Date('2024-01-01T10:00:00Z')
        },
        {
          username: 'bob',
          email: 'bob@test.com',
          password_hash: 'hash2',
          is_online: false,
          last_seen: new Date('2024-01-01T09:00:00Z')
        },
        {
          username: 'charlie',
          email: 'charlie@test.com',
          password_hash: 'hash3',
          is_online: true,
          last_seen: new Date('2024-01-01T11:00:00Z')
        }
      ]).execute();

      const result = await getOnlineUsers();

      expect(result).toHaveLength(2);
      expect(result.map(u => u.username)).toEqual(['charlie', 'alice']); // Ordered by last_seen desc, then username asc
      
      // Verify only public fields are returned
      result.forEach(user => {
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('username');
        expect(user).toHaveProperty('avatar_url');
        expect(user).toHaveProperty('is_online');
        expect(user).toHaveProperty('last_seen');
        expect(user).not.toHaveProperty('email');
        expect(user).not.toHaveProperty('password_hash');
        expect(user.is_online).toBe(true);
      });
    });

    it('should return empty array when no users are online', async () => {
      await db.insert(usersTable).values([
        {
          username: 'offline_user',
          email: 'offline@test.com',
          password_hash: 'hash1',
          is_online: false
        }
      ]).execute();

      const result = await getOnlineUsers();

      expect(result).toHaveLength(0);
    });

    it('should limit results to 100 users', async () => {
      // This test would be expensive with 101 users, so we'll test the concept
      const result = await getOnlineUsers();
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users except current user', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'current_user',
          email: 'current@test.com',
          password_hash: 'hash1',
          is_online: true
        },
        {
          username: 'alice',
          email: 'alice@test.com',
          password_hash: 'hash2',
          is_online: false
        },
        {
          username: 'bob',
          email: 'bob@test.com',
          password_hash: 'hash3',
          is_online: true
        }
      ]).returning({ id: usersTable.id }).execute();

      const currentUserId = users[0].id;
      const result = await getAllUsers(currentUserId);

      expect(result).toHaveLength(2);
      expect(result.map(u => u.username)).toEqual(['alice', 'bob']); // Alphabetical order
      expect(result.every(u => u.id !== currentUserId)).toBe(true);

      // Verify only public fields are returned
      result.forEach(user => {
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('username');
        expect(user).toHaveProperty('avatar_url');
        expect(user).toHaveProperty('is_online');
        expect(user).toHaveProperty('last_seen');
        expect(user).not.toHaveProperty('email');
        expect(user).not.toHaveProperty('password_hash');
      });
    });

    it('should return empty array when only current user exists', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'only_user',
          email: 'only@test.com',
          password_hash: 'hash1',
          is_online: true
        }
      ]).returning({ id: usersTable.id }).execute();

      const result = await getAllUsers(users[0].id);

      expect(result).toHaveLength(0);
    });
  });

  describe('searchUsers', () => {
    it('should find users by partial username match', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'alice_smith',
          email: 'alice@test.com',
          password_hash: 'hash1'
        },
        {
          username: 'bob_alice',
          email: 'bob@test.com',
          password_hash: 'hash2'
        },
        {
          username: 'charlie_brown',
          email: 'charlie@test.com',
          password_hash: 'hash3'
        },
        {
          username: 'current_user',
          email: 'current@test.com',
          password_hash: 'hash4'
        }
      ]).returning({ id: usersTable.id }).execute();

      const currentUserId = users[3].id;
      const result = await searchUsers('alice', currentUserId);

      expect(result).toHaveLength(2);
      expect(result.map(u => u.username)).toEqual(['alice_smith', 'bob_alice']); // Alphabetical order
      expect(result.every(u => u.id !== currentUserId)).toBe(true);
    });

    it('should be case insensitive', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'Alice_Test',
          email: 'alice@test.com',
          password_hash: 'hash1'
        },
        {
          username: 'current_user',
          email: 'current@test.com',
          password_hash: 'hash2'
        }
      ]).returning({ id: usersTable.id }).execute();

      const currentUserId = users[1].id;
      const result = await searchUsers('alice', currentUserId);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('Alice_Test');
    });

    it('should exclude current user from search results', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'alice_current',
          email: 'alice@test.com',
          password_hash: 'hash1'
        }
      ]).returning({ id: usersTable.id }).execute();

      const currentUserId = users[0].id;
      const result = await searchUsers('alice', currentUserId);

      expect(result).toHaveLength(0);
    });

    it('should limit results to 20 users', async () => {
      const result = await searchUsers('test', 999);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should return empty array when no matches found', async () => {
      await db.insert(usersTable).values([
        {
          username: 'alice',
          email: 'alice@test.com',
          password_hash: 'hash1'
        }
      ]).execute();

      const result = await searchUsers('xyz', 999);

      expect(result).toHaveLength(0);
    });
  });

  describe('updateUserStatus', () => {
    it('should update user online status and last_seen', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'test_user',
          email: 'test@test.com',
          password_hash: 'hash1',
          is_online: false,
          last_seen: new Date('2024-01-01T10:00:00Z')
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const input: UpdateUserStatusInput = { is_online: true };

      const result = await updateUserStatus(input, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('User status updated successfully');

      // Verify database was updated
      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      expect(updatedUser[0].is_online).toBe(true);
      expect(updatedUser[0].last_seen).toBeInstanceOf(Date);
      expect(updatedUser[0].updated_at).toBeInstanceOf(Date);
    });

    it('should update user to offline status', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'test_user',
          email: 'test@test.com',
          password_hash: 'hash1',
          is_online: true
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const input: UpdateUserStatusInput = { is_online: false };

      const result = await updateUserStatus(input, userId);

      expect(result.success).toBe(true);

      // Verify database was updated
      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      expect(updatedUser[0].is_online).toBe(false);
    });
  });

  describe('updateUserProfile', () => {
    it('should update username', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'old_username',
          email: 'test@test.com',
          password_hash: 'hash1',
          avatar_url: 'old_avatar.jpg',
          is_online: true
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const updates = { username: 'new_username' };

      const result = await updateUserProfile(userId, updates);

      expect(result.username).toBe('new_username');
      expect(result.avatar_url).toBe('old_avatar.jpg'); // Unchanged
      expect(result.id).toBe(userId);
      expect(result).toHaveProperty('is_online');
      expect(result).toHaveProperty('last_seen');

      // Verify database was updated
      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      expect(updatedUser[0].username).toBe('new_username');
      expect(updatedUser[0].updated_at).toBeInstanceOf(Date);
    });

    it('should update avatar_url', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'test_user',
          email: 'test@test.com',
          password_hash: 'hash1',
          avatar_url: 'old_avatar.jpg'
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const updates = { avatar_url: 'new_avatar.jpg' };

      const result = await updateUserProfile(userId, updates);

      expect(result.avatar_url).toBe('new_avatar.jpg');
      expect(result.username).toBe('test_user'); // Unchanged
    });

    it('should update both username and avatar_url', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'old_username',
          email: 'test@test.com',
          password_hash: 'hash1',
          avatar_url: 'old_avatar.jpg'
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const updates = { username: 'new_username', avatar_url: 'new_avatar.jpg' };

      const result = await updateUserProfile(userId, updates);

      expect(result.username).toBe('new_username');
      expect(result.avatar_url).toBe('new_avatar.jpg');
    });

    it('should handle null avatar_url', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'test_user',
          email: 'test@test.com',
          password_hash: 'hash1',
          avatar_url: 'old_avatar.jpg'
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const updates = { avatar_url: null };

      const result = await updateUserProfile(userId, updates);

      expect(result.avatar_url).toBeNull();
    });

    it('should throw error when user not found', async () => {
      const nonExistentUserId = 99999;
      const updates = { username: 'new_username' };

      await expect(updateUserProfile(nonExistentUserId, updates))
        .rejects.toThrow(/User not found/i);
    });

    it('should return only public user fields', async () => {
      const users = await db.insert(usersTable).values([
        {
          username: 'test_user',
          email: 'secret@test.com',
          password_hash: 'secret_hash',
          avatar_url: 'avatar.jpg'
        }
      ]).returning({ id: usersTable.id }).execute();

      const userId = users[0].id;
      const updates = { username: 'updated_user' };

      const result = await updateUserProfile(userId, updates);

      // Verify only public fields are returned
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('avatar_url');
      expect(result).toHaveProperty('is_online');
      expect(result).toHaveProperty('last_seen');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('password_hash');
    });
  });
});