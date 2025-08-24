import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/utils/trpc';
import type { PublicUser } from '../../../server/src/schema';

interface OnlineUsersProps {
  onlineUsers: PublicUser[];
  currentUser: PublicUser;
  onStartPrivateChat: (otherUser: PublicUser) => void;
}

export function OnlineUsers({ onlineUsers, currentUser, onStartPrivateChat }: OnlineUsersProps) {
  const [isStartingChat, setIsStartingChat] = useState<number | null>(null);

  const handleStartPrivateChat = async (otherUser: PublicUser) => {
    if (otherUser.id === currentUser.id) return;
    
    setIsStartingChat(otherUser.id);
    try {
      await trpc.privateChats.create.mutate({
        otherUserId: otherUser.id
      });
      onStartPrivateChat(otherUser);
    } catch (error) {
      console.error('Failed to create private chat:', error);
    } finally {
      setIsStartingChat(null);
    }
  };

  const formatLastSeen = (lastSeen: Date | null): string => {
    if (!lastSeen) return 'Never';
    
    const now = new Date();
    const diff = now.getTime() - new Date(lastSeen).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Filter out current user and sort by online status then username
  const filteredUsers = onlineUsers
    .filter((user: PublicUser) => user.id !== currentUser.id)
    .sort((a: PublicUser, b: PublicUser) => {
      if (a.is_online === b.is_online) {
        return a.username.localeCompare(b.username);
      }
      return a.is_online ? -1 : 1;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-green-600 uppercase tracking-wider">
          Online Users
        </h3>
        <Badge 
          variant="outline" 
          className="text-xs border-green-600 text-green-500"
        >
          {onlineUsers.filter((user: PublicUser) => user.is_online).length} online
        </Badge>
      </div>

      {/* Current User */}
      <div className="p-2 bg-green-900/20 rounded border border-green-700">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8 border border-green-600">
            <AvatarImage src={currentUser.avatar_url || undefined} />
            <AvatarFallback className="bg-green-800 text-green-200 text-xs font-mono">
              {currentUser.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-green-300 truncate">
                {currentUser.username}
              </span>
              <Badge className="bg-green-800 text-green-200 text-xs px-1 py-0">
                YOU
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-xs text-green-500 font-mono">
              <span className="w-2 h-2 bg-green-400 rounded-full status-online"></span>
              Online
            </div>
          </div>
        </div>
      </div>

      {/* Other Users */}
      <div className="space-y-1">
        {filteredUsers.length === 0 ? (
          <div className="text-center text-green-600 font-mono text-sm py-4">
            <div className="mb-2">👥</div>
            <p>No other users online</p>
          </div>
        ) : (
          filteredUsers.map((user: PublicUser) => (
            <div
              key={user.id}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar className="w-8 h-8 border border-green-700">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback className="bg-green-800 text-green-200 text-xs font-mono">
                    {user.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-green-300 truncate">
                      {user.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-mono">
                    {user.is_online ? (
                      <>
                        <span className="w-2 h-2 bg-green-400 rounded-full status-online"></span>
                        <span className="text-green-500">Online</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                        <span className="text-gray-500">
                          {formatLastSeen(user.last_seen)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStartPrivateChat(user)}
                  disabled={isStartingChat === user.id}
                  className="text-xs border-green-700 text-green-400 hover:bg-green-900 font-mono px-2 py-1"
                >
                  {isStartingChat === user.id ? '...' : 'DM'}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-xs text-green-600 font-mono text-center pt-2 border-t border-green-800">
        💬 Click DM to start a private conversation
      </div>
    </div>
  );
}