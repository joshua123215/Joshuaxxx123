import React, { useState, useEffect, Suspense } from 'react';
import { Home, Film, ShieldCheck, Loader2, Compass, Bookmark, User as UserIcon, Search, Video } from 'lucide-react';
import LiveBroadcasts from './components/LiveBroadcasts';
import PushNotification from './components/PushNotification';
import AuthModal from './components/AuthModal';
import GlobalMenu from './components/GlobalMenu';
import GlobalHeader from './components/GlobalHeader';
import ErrorBoundary from './components/ErrorBoundary';
import ActiveDownloadsBar from './components/ActiveDownloadsBar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { isAdminUser } from './utils/subscription';
import { fetchPlatformStatus } from './utils/geo';
import axios from 'axios';

const NewsFeed = React.lazy(() => import('./components/NewsFeed'));
const MovieSearch = React.lazy(() => import('./components/MovieSearch'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const ArticleView = React.lazy(() => import('./components/ArticleView'));
const Bookmarks = React.lazy(() => import('./components/Bookmarks'));
const Profile = React.lazy(() => import('./components/Profile'));
const SearchNews = React.lazy(() => import('./components/SearchNews'));
const Explore = React.lazy(() => import('./components/Explore'));
const AdFreeMovies = React.lazy(() => import('./components/AdFreeMovies'));
const AIContentAutomation = React.lazy(() => import('./components/AIContentAutomation'));
const PromoPosterStudio = React.lazy(() => import('./components/PromoPosterStudio'));


export default function App() {
  const [currentView, setCurrentView] = useState(() => {
    const hash = window.location.hash;
    if (hash === '#promo' || hash === '#promotion') return 'promo';
    if (hash === '#automation') return 'automation';
    if (hash === '#movies') return 'movies';
    if (hash === '#adfree') return 'adfree';
    if (hash === '#explore') return 'explore';
    if (hash === '#saved') return 'saved';
    if (hash === '#profile') return 'profile';
    if (hash === '#search') return 'search';
    if (hash === '#admin') return 'admin';
    return 'news';
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [cachedNews, setCachedNews] = useState<Record<string, any[]>>({});
  const [newsError, setNewsError] = useState(false);
  const [isFetchingCategory, setIsFetchingCategory] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#category=')) {
      const cat = decodeURIComponent(hash.split('=')[1]);
      return cat;
    }
    return "Top Stories";
  });

  useEffect(() => {
    fetchPlatformStatus();
    const handleStatusChanged = () => {
      // Force trigger state update
      setUser(prev => (prev ? { ...prev } as User : null));
    };
    window.addEventListener('platform-status-changed', handleStatusChanged);
    return () => window.removeEventListener('platform-status-changed', handleStatusChanged);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchRealtimeNews(activeCategory);
  }, []);

  useEffect(() => {
    if (currentView && currentView !== 'news' && currentView !== 'article') {
      window.location.hash = currentView;
    } else if (currentView === 'news' && !window.location.hash.startsWith('#category=')) {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [currentView]);

  useEffect(() => {
    const handleNavigate = (e: any) => setCurrentView(e.detail);
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  const fetchRealtimeNews = async (category: string = "Top Stories", forceRefresh = false) => {
    if (!forceRefresh && cachedNews[category] && cachedNews[category].length > 0) {
        setNewsItems(cachedNews[category]);
        setIsLoadingNews(false);
        setNewsError(false);
        return;
    }
    if (isFetchingCategory === category) return; // prevent duplicate fetch

    setIsFetchingCategory(category);
    setIsLoadingNews(true); 
    if(!forceRefresh) setNewsItems([]);
    setNewsError(false);
    
    try {
      const res = await axios.get(`/api/news?category=${encodeURIComponent(category)}&t=${Date.now()}`, { timeout: 15000 });
      const formattedData = res.data.map((item: any) => ({
        ...item,
        image: item.image,
      }));
      setNewsItems(formattedData);
      setCachedNews(prev => ({ ...prev, [category]: formattedData }));
      if (formattedData.length === 0) setNewsError(true);
    } catch (error) {
      console.error("Error fetching news:", error);
      setNewsError(true);
      setNewsItems([]);
    } finally {
      setIsLoadingNews(false);
      setIsFetchingCategory(null);
    }
  };

  const handleArticleClick = (article: any) => {
    setSelectedArticle(article);
    setCurrentView('article');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'promo':
      case 'promotion':
        return <PromoPosterStudio onBack={() => setCurrentView('news')} />;
      case 'automation':
        return <AIContentAutomation user={user} onOpenAuth={() => setIsAuthModalOpen(true)} />;

      case 'adfree':
        return <AdFreeMovies user={user} />;
      case 'movies':
        return <MovieSearch />;
      case 'search':
        return <SearchNews onArticleClick={handleArticleClick} />;
      case 'explore':
        return <Explore onArticleClick={handleArticleClick} trendingNews={newsItems} />;
      case 'saved':
        return <Bookmarks user={user} onArticleClick={handleArticleClick} />;
      case 'profile':
        return (
          <Profile 
            user={user} 
            onOpenAuth={() => setIsAuthModalOpen(true)} 
            onViewBookmarks={() => setCurrentView('saved')} 
            onViewAdmin={() => setCurrentView('admin')}
          />
        );
      case 'admin':
        return isAdminUser(user) ? (
          <AdminDashboard />
        ) : (
          <NewsFeed 
            newsItems={newsItems} 
            isLoading={isLoadingNews} 
            hasError={newsError} 
            onArticleClick={handleArticleClick} 
            onRefresh={() => fetchRealtimeNews(activeCategory, true)} 
            activeCategory={activeCategory} 
            onCategoryChange={(cat) => { setActiveCategory(cat); window.location.hash = `category=${encodeURIComponent(cat)}`; fetchRealtimeNews(cat); }} 
          />
        );
      case 'article':
        return selectedArticle ? (
          <ArticleView 
            article={selectedArticle} 
            onBack={() => setCurrentView('news')} 
            user={user} 
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        ) : (
          <NewsFeed 
            newsItems={newsItems} 
            isLoading={isLoadingNews} 
            hasError={newsError} 
            onArticleClick={handleArticleClick} 
            onRefresh={() => fetchRealtimeNews(activeCategory, true)} 
            activeCategory={activeCategory} 
            onCategoryChange={(cat) => { setActiveCategory(cat); window.location.hash = `category=${encodeURIComponent(cat)}`; fetchRealtimeNews(cat); }} 
          />
        );
      case 'news':
      default:
        return (
          <NewsFeed 
            newsItems={newsItems} 
            isLoading={isLoadingNews} 
            hasError={newsError} 
            onArticleClick={handleArticleClick} 
            onRefresh={() => fetchRealtimeNews(activeCategory, true)} 
            activeCategory={activeCategory} 
            onCategoryChange={(cat) => { setActiveCategory(cat); window.location.hash = `category=${encodeURIComponent(cat)}`; fetchRealtimeNews(cat); }} 
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-blue-500/30 pb-20 lg:pb-0 relative flex flex-col">
      <GlobalMenu />
      <PushNotification />
      
      {/* Hide header on article view for immersive reading */}
      {currentView !== 'article' && (
        <GlobalHeader 
          onSearchClick={() => setCurrentView('search')} 
          onNotificationClick={() => {}} 
          user={user}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}
      
      <main className="flex-1 w-full max-w-7xl mx-auto min-h-screen pt-4 pb-24">
        <ActiveDownloadsBar />
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>}>
            {renderContent()}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around p-2 pb-safe z-40">
        <button 
          onClick={() => setCurrentView('news')}
          className={`flex flex-col items-center gap-1 p-2 ${currentView === 'news' || currentView === 'article' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Home className={`w-6 h-6 ${currentView === 'news' || currentView === 'article' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        
        <button 
          onClick={() => setCurrentView('explore')}
          className={`flex flex-col items-center gap-1 p-2 ${currentView === 'explore' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Compass className={`w-6 h-6 ${currentView === 'explore' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Explore</span>
        </button>

        <button 
          onClick={() => setCurrentView('movies')}
          className={`flex flex-col items-center gap-1 p-2 ${currentView === 'movies' || currentView === 'adfree' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Film className={`w-6 h-6 ${currentView === 'movies' || currentView === 'adfree' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">Movies</span>
        </button>

        <button 
          onClick={() => setCurrentView('automation')}
          className={`flex flex-col items-center gap-1 p-2 ${currentView === 'automation' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Video className={`w-6 h-6 ${currentView === 'automation' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-medium">AI Videos</span>
        </button>

        <button 
          onClick={() => setCurrentView('profile')}
          className={`flex flex-col items-center gap-1 p-2 ${currentView === 'profile' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          {user && user.photoURL ? (
             <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-white/20" />
          ) : (
             <UserIcon className={`w-6 h-6 ${currentView === 'profile' ? 'fill-current' : ''}`} />
          )}
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </div>

      <LiveBroadcasts />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

    </div>
  );
}
