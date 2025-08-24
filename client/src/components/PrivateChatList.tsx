import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/utils/trpc';
import type { PublicUser, ChannelWithMembers } from '../../../server/src/schema';

interface PrivateChatListProps {
  currentUser: PublicUser;
  activeChannel: ChannelWithMembers | null;
  onChannelSelect: (channel: ChannelWithMembers) => void;
}

export function PrivateChatList({ currentUser, activeChannel, onChannelSelect }: PrivateChatListProps) {
  const [privateChats, setPrivateChats] = useState<ChannelWithMembers[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadPrivateChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const chats = await trpc.privateChats.get.query();
      // Transform the API response to match ChannelWithMembers structure
      const transformedChats: ChannelWithMembers[] = chats.map((chat: any) => ({
        id: chat.id,
        name: chat.name || chat.otherUser?.username || 'Private Chat',
        description: chat.description,
        is_private: chat.is_private,
        created_by: chat.created_by,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        members: chat.otherUser ? [chat.otherUser] : [],
        member_count: 2 // Always 2 for direct private chats
      }));
      setPrivateChats(transformedChats);
    } catch (error) {
      console.error('Failed to load private chats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrivateChats();
  }, [loadPrivateChats]);

  const getOtherUser = (channel: ChannelWithMembers): PublicUser | null => {
    // Find the user who is not the current user
    return channel.members.find((member: PublicUser) => member.id !== currentUser.id) || null;
  };

  const getChatDisplayName = (channel: ChannelWithMembers): string => {
    const otherUser = getOtherUser(channel);
    if (otherUser) {
      return otherUser.username;
    }
    
    // Fallback to channel name if no other user found
    return channel.name || 'Unknown Chat';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-green-400 font-mono animate-pulse text-sm">
          {'>'} Loading private chats...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-green-600 uppercase tracking-wider">
          Private Messages
        </h3>
        <Badge 
          variant="outline" 
          className="text-xs border-green-600 text-green-500"
        >
          {privateChats.length}
        </Badge>
      </div>

      <div className="space-y-1">
        {privateChats.length === 0 ? (
          <div className="text-center text-green-600 font-mono text-sm py-8">
            <div className="mb-2">💬</div>
            <p>No private chats yet</p>
            <p className="text-xs mt-2">
              Click DM next to a user to start chatting
            </p>
          </div>
        ) : (
          privateChats.map((chat: ChannelWithMembers) => {
            const otherUser = getOtherUser(chat);
            const displayName = getChatDisplayName(chat);
            
            return (
              <button
                key={chat.id}
                onClick={() => onChannelSelect(chat)}
                className={`w-full text-left p-3 rounded font-mono text-sm transition-colors ${
                  activeChannel?.id === chat.id
                    ? 'bg-green-900 text-green-200 border border-green-700'
                    : 'bg-gray-700 text-green-400 hover:bg-gray-600 border border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-green-700">
                    <AvatarImage src={otherUser?.avatar_url || undefined} />
                    <AvatarFallback className="bg-green-800 text-green-200 text-xs font-mono">
                      {displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">
                        {displayName}
                      </span>
                      {otherUser?.is_online && (
                        <span className="w-2 h-2 bg-green-400 rounded-full status-online"></span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-green-600">
                        Private conversation
                      </span>
                      <Badge 
                        variant="outline" 
                        className="text-xs border-green-600 text-green-500"
                      >
                        {chat.member_count}
                      </Badge>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="text-xs text-green-600 font-mono text-center pt-2 border-t border-green-800">
        🔒 End-to-end encrypted conversations
      </div>
    </div>
  );
}