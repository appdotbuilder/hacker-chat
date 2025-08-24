import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatChannelsTable, channelMembersTable } from '../db/schema';
import { type CreateChannelInput, type JoinChannelInput } from '../schema';
import { createChannel, getPublicChannels, getUserChannels, joinChannel, leaveChannel, getChannelMembers } from '../handlers/channels';
import { eq, and } from 'drizzle-orm';

// Test users data
const testUsers = [
  {
    username: 'testuser1',
    email: 'test1@example.com',
    password_hash: 'hashedpassword1',
    avatar_url: 'https://example.com/avatar1.jpg',
    is_online: true
  },
  {
    username: 'testuser2', 
    email: 'test2@example.com',
    password_hash: 'hashedpassword2',
    avatar_url: null,
    is_online: false
  },
  {
    username: 'testuser3',
    email: 'test3@example.com', 
    password_hash: 'hashedpassword3',
    avatar_url: 'https://example.com/avatar3.jpg',
    is_online: true
  }
];

// Test input for creating channels
const testChannelInput: CreateChannelInput = {
  name: 'Test Channel',
  description: 'A channel for testing',
  is_private: false,
  member_user_ids: []
};

const testPrivateChannelInput: CreateChannelInput = {
  name: 'Private Test Channel',
  description: 'A private channel for testing',
  is_private: true,
  member_user_ids: [2, 3] // Will be set after users are created
};

describe('createChannel', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a public channel successfully', async () => {
    // Create test user first
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const result = await createChannel(testChannelInput, users[0].id);

    // Verify channel properties
    expect(result.name).toEqual('Test Channel');
    expect(result.description).toEqual('A channel for testing');
    expect(result.is_private).toEqual(false);
    expect(result.created_by).toEqual(users[0].id);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create creator as owner in channel members', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const result = await createChannel(testChannelInput, users[0].id);

    // Verify creator is added as owner
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, result.id),
        eq(channelMembersTable.user_id, users[0].id)
      ))
      .execute();

    expect(membership).toHaveLength(1);
    expect(membership[0].role).toEqual('owner');
  });

  it('should create private channel with specified members', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const privateChannelInput: CreateChannelInput = {
      ...testPrivateChannelInput,
      member_user_ids: [users[1].id, users[2].id]
    };

    const result = await createChannel(privateChannelInput, users[0].id);

    expect(result.is_private).toEqual(true);

    // Verify all members were added
    const members = await db.select()
      .from(channelMembersTable)
      .where(eq(channelMembersTable.channel_id, result.id))
      .execute();

    expect(members).toHaveLength(3); // Creator + 2 invited members
    
    const roles = members.map(m => ({ user_id: m.user_id, role: m.role }));
    expect(roles).toContainEqual({ user_id: users[0].id, role: 'owner' });
    expect(roles).toContainEqual({ user_id: users[1].id, role: 'member' });
    expect(roles).toContainEqual({ user_id: users[2].id, role: 'member' });
  });

  it('should throw error when creator user does not exist', async () => {
    await expect(createChannel(testChannelInput, 999)).rejects.toThrow(/Creator user not found/i);
  });

  it('should handle channel with null description', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const inputWithoutDescription: CreateChannelInput = {
      name: 'No Description Channel',
      is_private: false,
      member_user_ids: []
    };

    const result = await createChannel(inputWithoutDescription, users[0].id);
    expect(result.description).toBeNull();
  });
});

describe('getPublicChannels', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return public channels with member information', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    // Create test channels
    await createChannel(testChannelInput, users[0].id);
    await createChannel({
      name: 'Another Public Channel',
      description: 'Another test channel',
      is_private: false
    }, users[1].id);

    const result = await getPublicChannels();

    expect(result).toHaveLength(2);
    expect(result[0].name).toEqual('Another Public Channel'); // Should be ordered by created_at desc
    expect(result[1].name).toEqual('Test Channel');
    
    // Verify member information is included
    expect(result[0].member_count).toEqual(1);
    expect(result[0].members).toHaveLength(1);
    expect(result[0].members[0].username).toEqual('testuser2');
    expect(result[0].members[0].is_online).toEqual(false);
  });

  it('should not return private channels', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    // Create both public and private channels
    await createChannel(testChannelInput, users[0].id);
    await createChannel({
      name: 'Private Channel',
      description: 'Private test channel',
      is_private: true
    }, users[1].id);

    const result = await getPublicChannels();

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Test Channel');
    expect(result[0].is_private).toEqual(false);
  });

  it('should return empty array when no public channels exist', async () => {
    const result = await getPublicChannels();
    expect(result).toHaveLength(0);
  });
});

describe('getUserChannels', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return channels where user is a member', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    // Create channels
    const channel1 = await createChannel(testChannelInput, users[0].id);
    const channel2 = await createChannel({
      name: 'Another Channel',
      description: 'Another test channel',
      is_private: false
    }, users[1].id);

    // Join user[0] to channel2
    await joinChannel({ channel_id: channel2.id }, users[0].id);

    const result = await getUserChannels(users[0].id);

    expect(result).toHaveLength(2);
    const channelNames = result.map(c => c.name);
    expect(channelNames).toContain('Test Channel');
    expect(channelNames).toContain('Another Channel');
  });

  it('should include both public and private channels', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    // Create public channel
    const publicChannel = await createChannel(testChannelInput, users[0].id);
    
    // Create private channel
    const privateChannel = await createChannel({
      name: 'Private Channel',
      description: 'Private test channel',
      is_private: true,
      member_user_ids: [users[0].id]
    }, users[1].id);

    const result = await getUserChannels(users[0].id);

    expect(result).toHaveLength(2);
    const channelTypes = result.map(c => ({ name: c.name, is_private: c.is_private }));
    expect(channelTypes).toContainEqual({ name: 'Test Channel', is_private: false });
    expect(channelTypes).toContainEqual({ name: 'Private Channel', is_private: true });
  });

  it('should throw error when user does not exist', async () => {
    await expect(getUserChannels(999)).rejects.toThrow(/User not found/i);
  });

  it('should return empty array when user is not a member of any channels', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const result = await getUserChannels(users[0].id);
    expect(result).toHaveLength(0);
  });
});

describe('joinChannel', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should allow user to join public channel', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);
    const joinInput: JoinChannelInput = { channel_id: channel.id };

    const result = await joinChannel(joinInput, users[1].id);

    expect(result.success).toEqual(true);
    expect(result.message).toEqual('Successfully joined channel');

    // Verify user was added to channel
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, channel.id),
        eq(channelMembersTable.user_id, users[1].id)
      ))
      .execute();

    expect(membership).toHaveLength(1);
    expect(membership[0].role).toEqual('member');
  });

  it('should prevent joining private channel', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const privateChannel = await createChannel({
      name: 'Private Channel',
      description: 'Private test channel',
      is_private: true
    }, users[0].id);

    const joinInput: JoinChannelInput = { channel_id: privateChannel.id };
    const result = await joinChannel(joinInput, users[1].id);

    expect(result.success).toEqual(false);
    expect(result.message).toEqual('Cannot join private channel without invitation');
  });

  it('should prevent joining non-existent channel', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const joinInput: JoinChannelInput = { channel_id: 999 };
    const result = await joinChannel(joinInput, users[0].id);

    expect(result.success).toEqual(false);
    expect(result.message).toEqual('Channel not found');
  });

  it('should prevent joining channel when already a member', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);
    const joinInput: JoinChannelInput = { channel_id: channel.id };

    // Try to join as creator (already owner)
    const result = await joinChannel(joinInput, users[0].id);

    expect(result.success).toEqual(false);
    expect(result.message).toEqual('Already a member of this channel');
  });

  it('should throw error when user does not exist', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);
    const joinInput: JoinChannelInput = { channel_id: channel.id };

    await expect(joinChannel(joinInput, 999)).rejects.toThrow(/User not found/i);
  });
});

describe('leaveChannel', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should allow member to leave channel', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);
    await joinChannel({ channel_id: channel.id }, users[1].id);

    const result = await leaveChannel(channel.id, users[1].id);

    expect(result.success).toEqual(true);
    expect(result.message).toEqual('Successfully left channel');

    // Verify user was removed from channel
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, channel.id),
        eq(channelMembersTable.user_id, users[1].id)
      ))
      .execute();

    expect(membership).toHaveLength(0);
  });

  it('should handle owner leaving channel', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);

    const result = await leaveChannel(channel.id, users[0].id);

    expect(result.success).toEqual(true);
    expect(result.message).toEqual('Successfully left channel');

    // Verify owner was removed from channel
    const membership = await db.select()
      .from(channelMembersTable)
      .where(and(
        eq(channelMembersTable.channel_id, channel.id),
        eq(channelMembersTable.user_id, users[0].id)
      ))
      .execute();

    expect(membership).toHaveLength(0);
  });

  it('should prevent leaving channel when not a member', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);

    const result = await leaveChannel(channel.id, users[1].id);

    expect(result.success).toEqual(false);
    expect(result.message).toEqual('Not a member of this channel');
  });
});

describe('getChannelMembers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return channel members with roles', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);
    await joinChannel({ channel_id: channel.id }, users[1].id);

    const result = await getChannelMembers(channel.id, users[0].id);

    expect(result).toHaveLength(2);
    
    const memberData = result.map(m => ({ username: m.username, role: m.role, is_online: m.is_online }));
    expect(memberData).toContainEqual({ username: 'testuser1', role: 'owner', is_online: true });
    expect(memberData).toContainEqual({ username: 'testuser2', role: 'member', is_online: false });
  });

  it('should include user online status and avatar', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);

    const result = await getChannelMembers(channel.id, users[0].id);

    expect(result).toHaveLength(1);
    expect(result[0].username).toEqual('testuser1');
    expect(result[0].avatar_url).toEqual('https://example.com/avatar1.jpg');
    expect(result[0].is_online).toEqual(true);
    expect(result[0].role).toEqual('owner');
  });

  it('should throw error when user is not a member of channel', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);

    await expect(getChannelMembers(channel.id, users[1].id))
      .rejects.toThrow(/Access denied: Not a member of this channel/i);
  });

  it('should order members by role and username', async () => {
    const users = await db.insert(usersTable)
      .values(testUsers)
      .returning()
      .execute();

    const channel = await createChannel(testChannelInput, users[0].id);
    await joinChannel({ channel_id: channel.id }, users[1].id);
    await joinChannel({ channel_id: channel.id }, users[2].id);

    // Promote user[2] to admin
    await db.update(channelMembersTable)
      .set({ role: 'admin' })
      .where(and(
        eq(channelMembersTable.channel_id, channel.id),
        eq(channelMembersTable.user_id, users[2].id)
      ))
      .execute();

    const result = await getChannelMembers(channel.id, users[0].id);

    expect(result).toHaveLength(3);
    // Should be ordered: owner, admin, member (by role hierarchy)
    expect(result[0].role).toEqual('owner'); // testuser1
    expect(result[1].role).toEqual('admin'); // testuser3
    expect(result[2].role).toEqual('member'); // testuser2
  });
});