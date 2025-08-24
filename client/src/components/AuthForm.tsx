import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/utils/trpc';
import type { SignupInput, LoginInput, AuthResponse } from '../../../server/src/schema';

interface AuthFormProps {
  onAuth: (response: AuthResponse) => void;
}

export function AuthForm({ onAuth }: AuthFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [loginData, setLoginData] = useState<LoginInput>({
    email: '',
    password: ''
  });

  const [signupData, setSignupData] = useState<SignupInput>({
    username: '',
    email: '',
    password: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await trpc.auth.login.mutate(loginData);
      onAuth(response);
      if (response.success) {
        setLoginData({ email: '', password: '' });
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await trpc.auth.signup.mutate(signupData);
      onAuth(response);
      if (response.success) {
        setSignupData({ username: '', email: '', password: '' });
      }
    } catch (error) {
      console.error('Signup failed:', error);
      setError('Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Card className="w-full max-w-md bg-gray-800 border-green-800 text-green-400">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-mono">
            {'>'} ACCESS TERMINAL
          </CardTitle>
          <p className="text-sm text-green-600 font-mono">
            Please authenticate to continue...
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-700 border border-green-800">
              <TabsTrigger 
                value="login" 
                className="font-mono data-[state=active]:bg-green-900 data-[state=active]:text-green-200"
              >
                LOGIN
              </TabsTrigger>
              <TabsTrigger 
                value="signup"
                className="font-mono data-[state=active]:bg-green-900 data-[state=active]:text-green-200"
              >
                REGISTER
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-mono block mb-1">EMAIL:</label>
                  <Input
                    type="email"
                    value={loginData.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLoginData((prev: LoginInput) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="user@terminal.local"
                    className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-mono block mb-1">PASSWORD:</label>
                  <Input
                    type="password"
                    value={loginData.password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLoginData((prev: LoginInput) => ({ ...prev, password: e.target.value }))
                    }
                    placeholder="••••••••"
                    className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-green-800 hover:bg-green-700 text-green-100 font-mono border border-green-600"
                >
                  {isLoading ? '> CONNECTING...' : '> LOGIN'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4">
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="text-sm font-mono block mb-1">USERNAME:</label>
                  <Input
                    value={signupData.username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSignupData((prev: SignupInput) => ({ ...prev, username: e.target.value }))
                    }
                    placeholder="hacker123"
                    className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
                    minLength={3}
                    maxLength={30}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-mono block mb-1">EMAIL:</label>
                  <Input
                    type="email"
                    value={signupData.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSignupData((prev: SignupInput) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="user@terminal.local"
                    className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-mono block mb-1">PASSWORD:</label>
                  <Input
                    type="password"
                    value={signupData.password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSignupData((prev: SignupInput) => ({ ...prev, password: e.target.value }))
                    }
                    placeholder="••••••••"
                    className="bg-gray-700 border-green-700 text-green-300 placeholder-green-600 font-mono"
                    minLength={6}
                    maxLength={100}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-green-800 hover:bg-green-700 text-green-100 font-mono border border-green-600"
                >
                  {isLoading ? '> CREATING ACCOUNT...' : '> REGISTER'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="mt-4 p-2 bg-red-900 border border-red-600 rounded text-red-200 text-sm font-mono">
              ERROR: {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}