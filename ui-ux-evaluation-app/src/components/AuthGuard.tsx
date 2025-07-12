'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export default function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const { user, loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('AuthGuard - user:', user, 'loading:', loading, 'session:', session);
    
    // 認証チェック完了後、未ログインの場合は即座にリダイレクト
    if (!loading) {
      if (!user || !session) {
        console.log('AuthGuard - 認証なし、リダイレクト実行:', redirectTo);
        router.replace(redirectTo);
        return;
      }
      console.log('AuthGuard - 認証OK、コンテンツ表示');
    }
  }, [user, loading, session, router, redirectTo]);

  // ローディング中の表示
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-gray-600">認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  // 未ログインの場合は認証待ち画面を表示
  if (!user || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-gray-600">リダイレクト中...</p>
        </div>
      </div>
    );
  }

  // ログイン済みの場合は子要素を表示
  return <>{children}</>;
}