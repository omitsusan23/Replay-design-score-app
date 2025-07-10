'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { User } from '@supabase/supabase-js';
import { 
  UserIcon, 
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon 
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

// Supabaseクライアント（シングルトン）
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabase;
}

interface AuthComponentProps {
  onAuthStateChange?: (user: User | null) => void;
}

export default function AuthComponent({ onAuthStateChange }: AuthComponentProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    // 初期認証状態の確認
    const getInitialSession = async () => {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
      if (onAuthStateChange) {
        onAuthStateChange(session?.user ?? null);
      }
    };

    getInitialSession();

    // 認証状態の変更を監視
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (onAuthStateChange) {
          onAuthStateChange(session?.user ?? null);
        }

        if (event === 'SIGNED_IN') {
          toast.success('ログインしました');
        } else if (event === 'SIGNED_OUT') {
          toast.success('ログアウトしました');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [onAuthStateChange]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        throw error;
      }

      // 成功時はonAuthStateChangeで処理される
      setEmail('');
      setPassword('');

    } catch (error) {
      console.error('Sign in error:', error);
      toast.error(`ログインエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      const { error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password: password
      });

      if (error) {
        throw error;
      }

      toast.success('確認メールを送信しました。メールを確認してアカウントを有効化してください。');
      setEmail('');
      setPassword('');

    } catch (error) {
      console.error('Sign up error:', error);
      toast.error(`登録エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error(`ログアウトエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/training-upload`
        }
      });

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('Google sign in error:', error);
      toast.error(`Googleログインエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">認証状態を確認中...</span>
      </div>
    );
  }

  if (user) {
    // ログイン済みの場合
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full">
              <UserIcon className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-900">
                ログイン中
              </p>
              <p className="text-xs text-green-700">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={authLoading}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-green-700 hover:text-green-900 hover:bg-green-100 rounded-md transition-colors disabled:opacity-50"
          >
            <ArrowLeftOnRectangleIcon className="w-4 h-4" />
            <span>ログアウト</span>
          </button>
        </div>
      </div>
    );
  }

  // 未ログインの場合
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-yellow-900 mb-2">
          ログインが必要です
        </h3>
        <p className="text-sm text-yellow-700">
          教師データをアップロードするには、アカウントでログインしてください。
        </p>
      </div>

      {/* タブ切り替え */}
      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => setIsSignUp(false)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            !isSignUp
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          ログイン
        </button>
        <button
          onClick={() => setIsSignUp(true)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            isSignUp
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          新規登録
        </button>
      </div>

      {/* メール・パスワードフォーム */}
      <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={authLoading}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            パスワード
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード（6文字以上）"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={6}
            disabled={authLoading}
          />
        </div>

        <button
          type="submit"
          disabled={authLoading || !email.trim() || !password}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {authLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <>
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span>{isSignUp ? 'アカウント作成' : 'ログイン'}</span>
            </>
          )}
        </button>
      </form>

      {/* 区切り線 */}
      <div className="my-4 flex items-center">
        <div className="flex-1 border-t border-gray-300"></div>
        <span className="px-3 text-sm text-gray-500">または</span>
        <div className="flex-1 border-t border-gray-300"></div>
      </div>

      {/* Googleログイン */}
      <button
        onClick={handleGoogleSignIn}
        disabled={authLoading}
        className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {authLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Googleでログイン</span>
          </>
        )}
      </button>

      {/* ヘルプテキスト */}
      <div className="mt-4 text-xs text-gray-600">
        <p>• アカウント作成時は確認メールが送信されます</p>
        <p>• パスワードは6文字以上で設定してください</p>
        <p>• Googleアカウントでも簡単にログインできます</p>
      </div>
    </div>
  );
}