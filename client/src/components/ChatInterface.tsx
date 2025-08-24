import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/utils/trpc';
import { ChannelList } from '@/components/ChannelList';
import { ChatMessages } from '@/components/ChatMessages';
import { MessageInput } from '@/components/MessageInput';
import { OnlineUsers } from '@/components/OnlineUsers';
import { PrivateChatList } from '@/components/PrivateChatList';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { PublicUser, ChannelWithMembers, MessageWithUser } from '../../../server/src/schema';

interface ChatInterfaceProps {
  currentUser: PublicUser;
  onLogout: () => void;
}

export function ChatInterface({ currentUser, onLogout }: ChatInterfaceProps) {
  const [activeChannel, setActiveChannel] = useState<ChannelWithMembers | null>(null);
  const [messages, setMessages] = useState<MessageWithUser[]>([]);
  const [publicChannels, setPublicChannels] = useState<ChannelWithMembers[]>([]);
  const [userChannels, setUserChannels] = useState<ChannelWithMembers[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<PublicUser[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Load public channels
  const loadPublicChannels = useCallback(async () => {
    try {
      const channels = await trpc.channels.getPublic.query();
      setPublicChannels(channels);
      // Auto-select first public channel if none selected
      if (!activeChannel && channels.length > 0) {
        setActiveChannel(channels[0]);
      }
    } catch (error) {
      console.error('Failed to load public channels:', error);
    }
  }, [activeChannel]);

  // Load user's channels
  const loadUserChannels = useCallback(async () => {
    try {
      const channels = await trpc.channels.getUserChannels.query();
      setUserChannels(channels);
    } catch (error) {
      console.error('Failed to load user channels:', error);
    }
  }, []);

  // Load online users
  const loadOnlineUsers = useCallback(async () => {
    try {
      const users = await trpc.users.getOnline.query();
      setOnlineUsers(users);
    } catch (error) {
      console.error('Failed to load online users:', error);
    }
  }, []);

  // Load messages for active channel
  const loadMessages = useCallback(async () => {
    if (!activeChannel) return;
    
    setIsLoadingMessages(true);
    try {
      const channelMessages = await trpc.messages.get.query({
        channel_id: activeChannel.id,
        limit: 50,
        offset: 0
      });
      setMessages(channelMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [activeChannel]);

  // Initial data loading
  useEffect(() => {
    loadPublicChannels();
    loadUserChannels();
    loadOnlineUsers();
  }, [loadPublicChannels, loadUserChannels, loadOnlineUsers]);

  // Load messages when active channel changes
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleChannelSelect = (channel: ChannelWithMembers) => {
    setActiveChannel(channel);
  };

  const handleMessageSent = (newMessage: MessageWithUser) => {
    setMessages((prev: MessageWithUser[]) => [...prev, newMessage]);
  };

  const handleJoinChannel = async (channelId: number) => {
    try {
      await trpc.channels.join.mutate({ channel_id: channelId });
      // Reload channels to update membership
      loadPublicChannels();
      loadUserChannels();
    } catch (error) {
      console.error('Failed to join channel:', error);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-120px)]">
      {/* Left Sidebar - Channels and Users */}
      <Card className="col-span-3 bg-gray-800 border-green-800 p-4 overflow-hidden">
        <Tabs defaultValue="channels" className="h-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-700 border border-green-800 mb-4">
            <TabsTrigger 
              value="channels" 
              className="font-mono text-xs data-[state=active]:bg-green-900 data-[state=active]:text-green-200"
            >
              CHANNELS
            </TabsTrigger>
            <TabsTrigger 
              value="private"
              className="font-mono text-xs data-[state=active]:bg-green-900 data-[state=active]:text-green-200"
            >
              PRIVATE
            </TabsTrigger>
            <TabsTrigger 
              value="users"
              className="font-mono text-xs data-[state=active]:bg-green-900 data-[state=active]:text-green-200"
            >
              USERS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="h-full overflow-y-auto">
            <ChannelList
              publicChannels={publicChannels}
              userChannels={userChannels}
              activeChannel={activeChannel}
              onChannelSelect={handleChannelSelect}
              onJoinChannel={handleJoinChannel}
              currentUser={currentUser}
            />
          </TabsContent>

          <TabsContent value="private" className="h-full overflow-y-auto">
            <PrivateChatList
              currentUser={currentUser}
              activeChannel={activeChannel}
              onChannelSelect={handleChannelSelect}
            />
          </TabsContent>

          <TabsContent value="users" className="h-full overflow-y-auto">
            <OnlineUsers
              onlineUsers={onlineUsers}
              currentUser={currentUser}
              onStartPrivateChat={(otherUser: PublicUser) => {
                // This will be handled by PrivateChatList component
                console.log('Starting private chat with:', otherUser.username);
              }}
            />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Main Chat Area */}
      <Card className="col-span-9 bg-gray-800 border-green-800 flex flex-col">
        {/* Chat Header */}
        <div className="border-b border-green-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              {activeChannel ? (
                <div>
                  <h2 className="text-lg font-mono text-green-300">
                    #{activeChannel.name}
                  </h2>
                  {activeChannel.description && (
                    <p className="text-sm text-green-600 font-mono">
                      {activeChannel.description}
                    </p>
                  )}
                </div>
              ) : (
                <h2 className="text-lg font-mono text-green-600">
                  Select a channel to start chatting...
                </h2>
              )}
            </div>
            {activeChannel && (
              <Badge 
                variant="outline" 
                className="border-green-600 text-green-400 font-mono"
              >
                {activeChannel.member_count} members
              </Badge>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          {activeChannel ? (
            <ChatMessages
              messages={messages}
              currentUser={currentUser}
              isLoading={isLoadingMessages}
              channelId={activeChannel.id}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-green-600 font-mono">
                <div className="text-6xl mb-4 matrix-text">🖥️</div>
                <div className="text-xl mb-2 text-green-400">WELCOME TO TERMINAL_CHAT</div>
                <p className="text-sm">Secure • Anonymous • Real-time</p>
                <div className="mt-4 space-y-2 text-xs">
                  <p>📡 Select a channel to join the conversation</p>
                  <p>🔒 Start private chats with other users</p>
                  <p>🌍 Connect with hackers worldwide</p>
                </div>
                <div className="mt-6">
                  <span className="cursor-blink text-green-300">█</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Message Input */}
        {activeChannel && (
          <div className="border-t border-green-800 p-4">
            <MessageInput
              channelId={activeChannel.id}
              currentUser={currentUser}
              onMessageSent={handleMessageSent}
            />
          </div>
        )}
      </Card>
    </div>
  );
}