import React from 'react';
import { User } from 'firebase/auth';
import { 
  Settings, Bell, Palette, Globe, LogOut, ChevronRight, 
  ShieldCheck, Bookmark 
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { isAdminUser } from '../utils/subscription';

interface ProfileProps {
  user: User | null;
  onOpenAuth: () => void;
  onViewBookmarks: () => void;
  onViewAdmin: () => void;
}

export default function Profile({ 
  user, 
  onOpenAuth, 
  onViewBookmarks, 
  onViewAdmin,
}: ProfileProps) {
  const isAdmin = isAdminUser(user);

  const handleSignOut = () => {
    signOut(auth).catch(console.error);
  };

  if (!user) {
    return (
      <div className="p-4 max-w-2xl mx-auto py-20 text-center">
        <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Settings className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Sign in to your account</h2>
        <p className="text-gray-400 mb-8 max-w-md mx-auto">
          Save articles, personalize your news feed, and access the AI Content Automation studio across all your devices.
        </p>
        <button 
          onClick={onOpenAuth}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-8 pb-24">
      {/* User Header */}
      <div className="flex items-center gap-6 p-6 bg-[#1a1a1a] rounded-3xl border border-white/5 shadow-lg">
        {user.photoURL ? (
          <img src={user.photoURL} alt={user.displayName || "User"} className="w-20 h-20 rounded-full object-cover border-2 border-white/10" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow-inner">
            {user.email?.charAt(0).toUpperCase() || 'U'}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-white mb-1">{user.displayName || 'News Reader'}</h2>
            {isAdmin && (
              <span className="px-2.5 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Admin
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm">{user.email}</p>
        </div>
      </div>

      {/* Content Navigation */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Your Content</h3>
        <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/5 shadow-lg">
          <button 
            onClick={onViewBookmarks}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
          >
            <div className="flex items-center gap-4 text-white">
              <Bookmark className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Saved Articles</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
          
          {isAdmin && (
            <button 
              onClick={onViewAdmin}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-4 text-white">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                <span className="font-medium">Admin Dashboard</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Navigation */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Settings</h3>
        <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/5 shadow-lg">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-4 text-white">
              <Bell className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Notifications</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-4 text-white">
              <Palette className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Appearance</span>
            </div>
            <span className="text-sm text-gray-500 flex items-center gap-2">Dark <ChevronRight className="w-4 h-4" /></span>
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-4 text-white">
              <Globe className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Language & Region</span>
            </div>
            <span className="text-sm text-gray-500 flex items-center gap-2">English (US) <ChevronRight className="w-4 h-4" /></span>
          </button>
        </div>
      </div>

      <button 
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 p-4 mt-8 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold rounded-2xl transition-colors border border-red-500/20"
      >
        <LogOut className="w-5 h-5" />
        Sign Out
      </button>
    </div>
  );
}
