import { db } from '../db';
import { usersTable } from '../db/schema';
import { type PublicUser, type UpdateUserStatusInput } from '../schema';
import { eq, ne, asc, desc, ilike, and } from 'drizzle-orm';

export async function getOnlineUsers(): Promise<PublicUser[]> {
    try {
        const results = await db.select({
            id: usersTable.id,
            username: usersTable.username,
            avatar_url: usersTable.avatar_url,
            is_online: usersTable.is_online,
            last_seen: usersTable.last_seen
        })
        .from(usersTable)
        .where(eq(usersTable.is_online, true))
        .orderBy(desc(usersTable.last_seen), asc(usersTable.username))
        .limit(100)
        .execute();

        return results;
    } catch (error) {
        console.error('Failed to fetch online users:', error);
        throw error;
    }
}

export async function getAllUsers(currentUserId: number): Promise<PublicUser[]> {
    try {
        const results = await db.select({
            id: usersTable.id,
            username: usersTable.username,
            avatar_url: usersTable.avatar_url,
            is_online: usersTable.is_online,
            last_seen: usersTable.last_seen
        })
        .from(usersTable)
        .where(ne(usersTable.id, currentUserId))
        .orderBy(asc(usersTable.username))
        .execute();

        return results;
    } catch (error) {
        console.error('Failed to fetch all users:', error);
        throw error;
    }
}

export async function searchUsers(query: string, currentUserId: number): Promise<PublicUser[]> {
    try {
        const results = await db.select({
            id: usersTable.id,
            username: usersTable.username,
            avatar_url: usersTable.avatar_url,
            is_online: usersTable.is_online,
            last_seen: usersTable.last_seen
        })
        .from(usersTable)
        .where(and(
            ne(usersTable.id, currentUserId),
            ilike(usersTable.username, `%${query}%`)
        ))
        .orderBy(asc(usersTable.username))
        .limit(20)
        .execute();

        return results;
    } catch (error) {
        console.error('Failed to search users:', error);
        throw error;
    }
}

export async function updateUserStatus(input: UpdateUserStatusInput, userId: number): Promise<{ success: boolean; message: string }> {
    try {
        const now = new Date();
        
        await db.update(usersTable)
            .set({
                is_online: input.is_online,
                last_seen: now,
                updated_at: now
            })
            .where(eq(usersTable.id, userId))
            .execute();

        return {
            success: true,
            message: 'User status updated successfully'
        };
    } catch (error) {
        console.error('Failed to update user status:', error);
        throw error;
    }
}

export async function updateUserProfile(userId: number, updates: { username?: string; avatar_url?: string | null }): Promise<PublicUser> {
    try {
        const now = new Date();
        const updateData: { username?: string; avatar_url?: string | null; updated_at: Date } = {
            updated_at: now
        };

        if (updates.username !== undefined) {
            updateData.username = updates.username;
        }
        if (updates.avatar_url !== undefined) {
            updateData.avatar_url = updates.avatar_url;
        }

        const results = await db.update(usersTable)
            .set(updateData)
            .where(eq(usersTable.id, userId))
            .returning({
                id: usersTable.id,
                username: usersTable.username,
                avatar_url: usersTable.avatar_url,
                is_online: usersTable.is_online,
                last_seen: usersTable.last_seen
            })
            .execute();

        if (results.length === 0) {
            throw new Error('User not found');
        }

        return results[0];
    } catch (error) {
        console.error('Failed to update user profile:', error);
        throw error;
    }
}