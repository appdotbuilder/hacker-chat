import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/utils/trpc';
import type { ChannelWithMembers, PublicUser, CreateChannelInput } from '../../../server/src/schema';

interface ChannelListProps {
  publicChannels: ChannelWithMembers[];
  userChannels: ChannelWithMembers[];
  activeChannel: ChannelWithMembers | null;
  onChannelSelect: (channel: ChannelWithMembers) => void;
  onJoinChannel: (channelId: number) => void;
  currentUser: PublicUser;
}

export function ChannelList({
  publicChannels,
  userChannels,
  activeChannel,
  onChannelSelect,
  onJoinChannel,
  currentUser
}: ChannelListProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createChannelData, setCreateChannelData] = useState<CreateChannelInput>({
    name: '',
    description: '',
    is_private: false,
    member_user_ids: []
  });

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const newChannel = await trpc.channels.create.mutate({
        ...createChannelData,
        description: createChannelData.description || null
      });
      
      // Reset form
      setCreateChannelData({
        name: '',
        description: '',
        is_private: false,
        member_user_ids: []
      });
      
      setIsCreateDialogOpen(false);
      
      // Select the new channel
      onChannelSelect({
        ...newChannel,
        members: [],
        member_count: 1
      });
    } catch (error) {
      console.error('Failed to create channel:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isUserInChannel = (channel: ChannelWithMembers): boolean => {
    return userChannels.some((userChannel: ChannelWithMembers) => userChannel.id === channel.id);
  };

  return (
    <div className="space-y-4">
      {/* Create Channel Button */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline"
            className="w-full border-green-700 text-green-400 hover:bg-green-900 font-mono text-xs"
          >
            + NEW CHANNEL
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-gray-800 border-green-800 text-green-400">
          <DialogHeader>
            <DialogTitle className="font-mono text-green-300">
              CREATE NEW CHANNEL
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateChannel} className="space-y-4">
            <div>
              <label className="text-sm font-mono block mb-1">CHANNEL NAME:</label>
              <Input
                value={createChannelData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCreateChannelData((prev: CreateChannelInput) => ({ ...prev, name: e.target.value }))
                }
                placeholder="general"
                className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className="text-sm font-mono block mb-1">DESCRIPTION (OPTIONAL):</label>
              <Input
                value={createChannelData.description || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCreateChannelData((prev: CreateChannelInput) => ({ 
                    ...prev, 
                    description: e.target.value || null 
                  }))
                }
                placeholder="Channel description"
                className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is-private"
                checked={createChannelData.is_private}
                onCheckedChange={(checked: boolean) =>
                  setCreateChannelData((prev: CreateChannelInput) => ({ 
                    ...prev, 
                    is_private: checked 
                  }))
                }
                className="border-green-700 data-[state=checked]:bg-green-800 data-[state=checked]:border-green-600"
              />
              <label htmlFor="is-private" className="text-sm font-mono text-green-400">
                PRIVATE CHANNEL
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="flex-1 border-gray-600 text-gray-400 hover:bg-gray-700 font-mono"
              >
                CANCEL
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-green-800 hover:bg-green-700 text-green-100 font-mono"
              >
                {isLoading ? 'CREATING...' : 'CREATE'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* User's Channels */}
      {userChannels.length > 0 && (
        <div>
          <h3 className="text-xs font-mono text-green-600 mb-2 uppercase tracking-wider">
            Your Channels
          </h3>
          <div className="space-y-1">
            {userChannels.map((channel: ChannelWithMembers) => (
              <button
                key={channel.id}
                onClick={() => onChannelSelect(channel)}
                className={`w-full text-left p-2 rounded font-mono text-sm transition-colors ${
                  activeChannel?.id === channel.id
                    ? 'bg-green-900 text-green-200 border border-green-700'
                    : 'bg-gray-700 text-green-400 hover:bg-gray-600 border border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {channel.is_private ? '🔒' : '#'}{channel.name}
                  </span>
                  <Badge 
                    variant="outline" 
                    className="text-xs border-green-600 text-green-500"
                  >
                    {channel.member_count}
                  </Badge>
                </div>
                {channel.description && (
                  <p className="text-xs text-green-600 truncate mt-1">
                    {channel.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Public Channels */}
      <div>
        <h3 className="text-xs font-mono text-green-600 mb-2 uppercase tracking-wider">
          Public Channels
        </h3>
        <div className="space-y-1">
          {publicChannels.map((channel: ChannelWithMembers) => (
            <div key={channel.id}>
              <button
                onClick={() => onChannelSelect(channel)}
                className={`w-full text-left p-2 rounded font-mono text-sm transition-colors ${
                  activeChannel?.id === channel.id
                    ? 'bg-green-900 text-green-200 border border-green-700'
                    : 'bg-gray-700 text-green-400 hover:bg-gray-600 border border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    #{channel.name}
                  </span>
                  <Badge 
                    variant="outline" 
                    className="text-xs border-green-600 text-green-500"
                  >
                    {channel.member_count}
                  </Badge>
                </div>
                {channel.description && (
                  <p className="text-xs text-green-600 truncate mt-1">
                    {channel.description}
                  </p>
                )}
              </button>
              
              {!isUserInChannel(channel) && (
                <Button
                  onClick={() => onJoinChannel(channel.id)}
                  variant="outline"
                  size="sm"
                  className="w-full mt-1 text-xs border-green-700 text-green-500 hover:bg-green-900 font-mono"
                >
                  JOIN CHANNEL
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}