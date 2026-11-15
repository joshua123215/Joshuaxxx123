import React from 'react';
import { Bell, Search, ShieldCheck } from 'lucide-react';
import { User } from 'firebase/auth';
import { isAdminUser } from '../utils/subscription';

interface GlobalHeaderProps {
  onSearchClick: () => void;
  onNotificationClick: () => void;
  user?: User | null;
  onOpenAuth?: () => void;
}

export default function GlobalHeader({ 
  onSearchClick, 
  onNotificationClick,
  user,
  onOpenAuth
}: GlobalHeaderProps) {
  const isAdmin = isAdminUser(user);

  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 pr-16 h-16 flex items-center justify-between">
        <div 
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'news' }))}
          className="flex items-center gap-3 cursor-pointer"
        >
          <img src="/logo.png" alt="GlobalNews Logo" className="w-8 h-8 rounded-lg object-contain bg-white/5" />
          <h1 className="text-xl font-bold text-white tracking-tight">GlobalNews</h1>
        </div>
                
        <div className="hidden lg:flex items-center gap-6">
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'news' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">News</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'explore' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Explore</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'search' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Search</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'movies' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Movies</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'automation' }))} className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors">AI Content Automation</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'promo' }))} className="text-sm font-semibold text-yellow-400 hover:text-yellow-300 transition-colors flex items-center gap-1.5">
            <span>Promo Flyer</span>
            <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded-full border border-yellow-500/30 font-bold uppercase">Print</span>
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'saved' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Saved</button>

          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Profile</button>
        </div>

        <div className="flex items-center gap-3">
          {/* Admin Badge */}
          {isAdmin && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </span>
          )}

          {/* User Sign In / Account Pill */}
          {user ? (
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }))}
              className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              title="View Profile"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden md:inline text-xs font-medium text-gray-300 max-w-[100px] truncate">
                {user.displayName || user.email?.split('@')[0]}
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Sign In
            </button>
          )}

          <button onClick={onSearchClick} className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
            <Search className="w-5 h-5" />
          </button>
          <button onClick={onNotificationClick} className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0a0a0a]"></span>
          </button>
        </div>
      </div>
    </header>
  );
}
