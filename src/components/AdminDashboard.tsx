import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Users, Mail, ShieldCheck, RefreshCw, Printer, Download, CheckCircle
} from 'lucide-react';
import { ADMIN_EMAIL } from '../utils/subscription';
import { syncUserCountToServer } from '../utils/geo';
import AdminVoiceSettingsPanel from './AdminVoiceSettingsPanel';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const fetchedUsers = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      setUsers(fetchedUsers);
      syncUserCountToServer(fetchedUsers.length);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError('Failed to load user analytics. Make sure you are signed in as an admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Admin Dashboard</h1>
            <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-xs font-bold rounded-full flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Joshua Ocansey ({ADMIN_EMAIL})
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Platform administration, AI voice settings, promo materials &amp; registered community members (100% free access).
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-[#1a1a1a] rounded-2xl p-5 border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Registered Users</p>
              <h2 className="text-3xl font-black text-white mt-0.5">{users.length}</h2>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl p-5 border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform Access</p>
              <h2 className="text-2xl font-black text-green-400 mt-0.5">100% Free &amp; Open</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Admin AI Voice Controls */}
      <AdminVoiceSettingsPanel adminEmail={ADMIN_EMAIL} />

      {/* Physical Promotion & Street Marketing Flyers */}
      <div className="bg-gradient-to-r from-[#0d1627] via-[#111f38] to-[#0a1322] rounded-3xl p-6 border border-blue-500/30 shadow-2xl space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-yellow-500/10 blur-[90px] pointer-events-none rounded-full" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                <Printer className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-extrabold text-white text-lg tracking-tight">
                  Physical Promotion Posters &amp; Handout Flyers
                </h3>
                <span className="text-[10px] bg-red-600/30 text-red-300 font-bold px-2 py-0.5 rounded-full border border-red-500/40 uppercase">
                  First 1,000 Founding Readers Campaign
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-300 max-w-2xl mt-1">
              Generate, customize, and print high-resolution 300-DPI A4 posters and street handouts for campuses, cafes, sports arenas, and community noticeboards with scannable QR codes linked to <strong className="text-white">globalnews.site</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
            <a
              href="/promo-poster-reference.png"
              download="globalnews-founding-readers-original.png"
              className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              title="Download original reference graphic file"
            >
              <Download className="w-4 h-4" />
              <span>Original PNG</span>
            </a>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'promo' }))}
              className="px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-extrabold rounded-xl text-xs transition-all shadow-lg shadow-yellow-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-black" />
              <span>Open Flyer Studio &amp; Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* USERS TABLE */}
      <div className="bg-[#1a1a1a] rounded-3xl border border-white/5 overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white">Registered Users</h3>
            <p className="text-xs text-gray-400">All community accounts have full free access</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#222] text-gray-400 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3.5">User</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Access</th>
                <th className="px-6 py-3.5">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(userItem => {
                const isAdminItem = userItem.email === ADMIN_EMAIL || userItem.email === 'joshuaocansey731@gmail.com' || userItem.role === 'admin';

                return (
                  <tr key={userItem.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {userItem.photoURL ? (
                          <img src={userItem.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold border border-yellow-500/30">
                            {userItem.email?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">{userItem.displayName || 'User'}</p>
                          <p className="text-gray-400 flex items-center gap-1 mt-0.5 text-xs">
                            <Mail className="w-3 h-3" />
                            {userItem.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        isAdminItem
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                          : 'bg-white/10 text-gray-300'
                      }`}>
                        {isAdminItem ? 'Admin' : 'Member'}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-green-500/15 text-green-300 rounded-full text-xs font-semibold border border-green-500/20">
                        Full Free Access
                      </span>
                    </td>

                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {userItem.createdAt?.toDate?.()?.toLocaleDateString() || 'Recent'}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
