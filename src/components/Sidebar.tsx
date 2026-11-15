import React from 'react';
import { Home, Compass, Bookmark, Settings, Hash, Activity, Film, User as UserIcon, LogOut, ShieldCheck, Video } from 'lucide-react';
import { User } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  user: User | null;
  onOpenAuth: () => void;
}

export default function Sidebar({ currentView, setCurrentView, user, onOpenAuth }: SidebarProps) {
  const menuItems = [
    { id: 'news', icon: <Home className="w-5 h-5" />, label: 'News' },
    { id: 'movies', icon: <Film className="w-5 h-5" />, label: 'Movies & Trailers' },
    { id: 'automation', icon: <Video className="w-5 h-5" />, label: 'AI Content Automation' },
    { id: 'world', icon: <Compass className="w-5 h-5" />, label: 'World' },
    { id: 'politics', icon: <Hash className="w-5 h-5" />, label: 'Politics' },
    { id: 'business', icon: <Activity className="w-5 h-5" />, label: 'Business' },
    { id: 'saved', icon: <Bookmark className="w-5 h-5" />, label: 'Saved' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/10 bg-[#0a0a0a] p-6 hidden lg:flex flex-col">
      <div className="flex items-center gap-3 mb-10">
        <img 
          src="/logo.png" 
          alt="GNS Logo" 
          className="w-10 h-10 object-contain rounded-xl"
        />
        <h1 className="text-xl font-bold text-white tracking-tight m-0">Global News Site</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item, idx) => (
          <button 
            key={idx}
            onClick={() => setCurrentView(item.id)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
              currentView === item.id 
                ? 'bg-white/10 text-white font-semibold' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        {user?.email === 'joshuaocansey731@gmail.com' && (
          <button 
            onClick={() => setCurrentView('admin')}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all mt-4 ${
              currentView === 'admin' 
                ? 'bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/30' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            Admin Dashboard
          </button>
        )}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/10 space-y-2">
        {user ? (
          <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-3 overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold border border-blue-500/30">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col items-start truncate">
                <span className="text-sm font-medium text-white truncate max-w-[100px]">{user.displayName || user.email?.split('@')[0]}</span>
                <span className="text-[10px] text-gray-400">Logged in</span>
              </div>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button 
            onClick={onOpenAuth}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all shadow-lg shadow-blue-900/20"
          >
            <UserIcon className="w-5 h-5" />
            Sign In / Sign Up
          </button>
        )}
        
        <button className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all">
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </div>
    </aside>
  );
}
