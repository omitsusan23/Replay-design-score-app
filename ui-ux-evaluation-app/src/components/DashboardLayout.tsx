'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import {
  HomeIcon,
  PlusIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  description: string;
}

const navigationItems: NavigationItem[] = [
  {
    name: 'ダッシュボード',
    href: '/dashboard',
    icon: HomeIcon,
    description: '提出履歴の確認',
  },
  {
    name: '新規投稿',
    href: '/dashboard/new',
    icon: PlusIcon,
    description: 'UI/UXデザインの投稿',
  },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error(`ログアウトエラー: ${error.message}`);
      } else {
        toast.success('ログアウトしました');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('ログアウト中にエラーが発生しました');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* モバイル用サイドバーオーバーレイ */}
      {sidebarOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <XMarkIcon className="h-6 w-6 text-white" />
              </button>
            </div>
            <SidebarContent 
              navigationItems={navigationItems} 
              pathname={pathname} 
              user={user} 
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      )}

      {/* デスクトップ用サイドバー */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 bg-white border-r border-gray-200">
          <SidebarContent 
            navigationItems={navigationItems} 
            pathname={pathname} 
            user={user} 
            onSignOut={handleSignOut}
          />
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="md:pl-64 flex flex-col flex-1">
        {/* トップバー */}
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <button
            type="button"
            className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="flex-1 px-4 flex justify-between items-center">
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900">
                Replay Design Score App
              </h1>
            </div>
            {/* ユーザー情報（モバイル用） */}
            <div className="md:hidden flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                <UserIcon className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-700 truncate max-w-32">
                  {user?.email}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ページコンテンツ */}
        <main className="flex-1">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// サイドバーコンテンツコンポーネント
function SidebarContent({ 
  navigationItems, 
  pathname, 
  user, 
  onSignOut 
}: {
  navigationItems: NavigationItem[];
  pathname: string;
  user: any;
  onSignOut: () => void;
}) {
  return (
    <>
      {/* ロゴ・ヘッダー */}
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-blue-600">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 bg-white rounded-full">
            <ChartBarIcon className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-lg font-semibold text-white">
            Design Score
          </h1>
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon
                  className={`mr-3 flex-shrink-0 h-5 w-5 ${
                    isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                  }`}
                />
                <div className="flex-1">
                  <div>{item.name}</div>
                  <div className="text-xs text-gray-500">{item.description}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* ユーザー情報とログアウト */}
        <div className="flex-shrink-0 border-t border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full">
                <UserIcon className="w-5 h-5 text-gray-600" />
              </div>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                ログイン中
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="mt-3 w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
          >
            <ArrowLeftOnRectangleIcon className="w-4 h-4 mr-2" />
            ログアウト
          </button>
        </div>
      </div>
    </>
  );
}