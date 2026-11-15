import React, { useState, useEffect, useCallback } from 'react';
import { BellRing, BellOff, X, Filter, Settings, Check } from 'lucide-react';
import axios from 'axios';
import { messaging } from '../lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';

interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  summary: string;
  image?: string;
  link?: string;
}

const CATEGORIES = [
  'World', 'Technology', 'Business', 'Sports', 'Entertainment', 'Health', 'Science'
];

export default function PushNotification() {
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [showPrompt, setShowPrompt] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const seenTitlesRef = React.useRef<Set<string>>(new Set());
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'default') {
        setShowPrompt(true);
      }
    }
    const savedState = localStorage.getItem('notifications_enabled');
    if (savedState !== null) {
      setEnabled(savedState === 'true');
    }
    
    const savedInterests = localStorage.getItem('notification_interests');
    if (savedInterests) {
      setSelectedInterests(JSON.parse(savedInterests));
    } else {
      setSelectedInterests(CATEGORIES); // Default all
    }
  }, []);

  const toggleInterest = (category: string) => {
    const updated = selectedInterests.includes(category)
      ? selectedInterests.filter(c => c !== category)
      : [...selectedInterests, category];
    setSelectedInterests(updated);
    localStorage.setItem('notification_interests', JSON.stringify(updated));
  };

  const setupFCM = async () => {
    try {
      const msg = await messaging();
      if (!msg) return;

      // Need a VAPID key to get a token. If we don't have one, this might fail, 
      // but we try so we use the FCM logic if available.
      // In production, we should pass: { vapidKey: 'YOUR_PUBLIC_VAPID_KEY_HERE' }
      try {
        const token = await getToken(msg);
        if (token) {
          setFcmToken(token);
          console.log("FCM Token registered:", token);
        }
      } catch (e) {
        console.warn("FCM getToken failed (no vapid key or permissions), falling back to polling.", e);
      }

      onMessage(msg, (payload) => {
        console.log('FCM Foreground Message:', payload);
        if (payload.notification) {
           new Notification(payload.notification.title || 'New Story', {
             body: payload.notification.body,
             icon: '/logo.png'
           });
        }
      });
    } catch (e) {
      console.error("FCM Setup Error:", e);
    }
  };

  const toggleNotifications = () => {
    const newState = !enabled;
    setEnabled(newState);
    localStorage.setItem('notifications_enabled', String(newState));
    if (newState && permission === 'granted') {
      setupFCM();
    }
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    setShowPrompt(false);
    if (result === 'granted') {
      setupFCM();
    }
  };

  useEffect(() => {
    if (permission === 'granted' && enabled) {
      setupFCM();
    }
  }, [permission, enabled]);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await axios.get('/api/news');
        if (res.data && res.data.length > 0) {
          setNewsList(res.data);
        }
      } catch (e: any) {
        if (e.message !== 'Network Error' && e.code !== 'ERR_NETWORK') {
          console.error("Error fetching news for notifications", e);
        }
      }
    };
    fetchNews();
    
    const pollInterval = setInterval(fetchNews, 120000);
    return () => clearInterval(pollInterval);
  }, []);

  const matchesInterests = useCallback((item: NewsItem) => {
    if (selectedInterests.length === 0) return false;
    const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
    return selectedInterests.some(interest => text.includes(interest.toLowerCase()));
  }, [selectedInterests]);

  const sendNativeNotification = useCallback((item: NewsItem) => {
    if (!enabled) return;
    if (!matchesInterests(item)) return; // Filter by personalized interests

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('GNS: ' + item.source, {
        body: item.title,
        image: item.image,
        tag: `news-${item.id}`, 
      });
      notification.onclick = () => {
        window.open(item.link || '#', '_blank');
      };
    }
  }, [enabled, matchesInterests]);

  useEffect(() => {
    if (newsList.length === 0 || permission !== 'granted' || !enabled) return;
    const notifyNext = () => {
      // Find a news item we haven't notified about YET that MATCHES their interests
      const nextItem = newsList.find(item => !seenTitlesRef.current.has(item.title) && matchesInterests(item));
      if (nextItem) {
        seenTitlesRef.current.add(nextItem.title);
        sendNativeNotification(nextItem);
      }
    };
    const initialTimer = setTimeout(notifyNext, 5000);
    const interval = setInterval(notifyNext, 25000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [newsList, permission, sendNativeNotification, enabled, matchesInterests]);

  return (
    <>
      <div className="fixed top-4 right-16 z-50 flex items-center gap-2">
        <button
          onClick={() => setShowPreferences(true)}
          className="p-2.5 rounded-full bg-[#1a1a1a]/80 backdrop-blur-md border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors shadow-lg"
          title="Notification Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={toggleNotifications}
          className={`p-2.5 rounded-full bg-[#1a1a1a]/80 backdrop-blur-md border border-white/10 transition-colors shadow-lg ${enabled ? 'text-blue-400 hover:text-blue-300' : 'text-gray-400 hover:text-white'}`}
          title={enabled ? "Disable Notifications" : "Enable Notifications"}
        >
          {enabled ? <BellRing className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </button>
      </div>

      {showPreferences && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#111111] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-500" />
                <h2 className="text-xl font-bold text-white tracking-tight">Notification Interests</h2>
              </div>
              <button onClick={() => setShowPreferences(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-400 mb-6">Select the categories you want to receive push notifications for when breaking news drops.</p>
              
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map(category => (
                  <button
                    key={category}
                    onClick={() => toggleInterest(category)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      selectedInterests.includes(category)
                        ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-inner'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-sm font-medium">{category}</span>
                    {selectedInterests.includes(category) && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>

              {!enabled && (
                <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
                  <BellOff className="w-5 h-5 flex-shrink-0" />
                  <p>Push notifications are currently disabled. Turn them on to receive alerts for these categories.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPrompt && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 shadow-2xl z-[100] flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <h4 className="text-white font-medium text-sm mb-1">Enable Notifications</h4>
            <p className="text-gray-400 text-xs mb-3">Get personalized alerts for your selected interests.</p>
            <div className="flex gap-2">
              <button 
                onClick={requestPermission}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Allow
              </button>
              <button 
                onClick={() => setShowPrompt(false)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Later
              </button>
            </div>
          </div>
          <button onClick={() => setShowPrompt(false)} className="text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
