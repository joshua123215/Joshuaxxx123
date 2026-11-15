import React, { useState } from 'react';
import { MoreVertical, Info, FileText, Phone, X, Printer } from 'lucide-react';

export default function GlobalMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalType, setModalType] = useState<'terms' | 'about' | 'contact' | null>(null);

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 bg-[#1a1a1a]/90 backdrop-blur-md border border-white/10 rounded-xl hover:bg-white/10 transition-colors shadow-lg"
        >
          <MoreVertical className="w-6 h-6 text-gray-300" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => { 
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'promo' })); 
                setIsOpen(false); 
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 transition-colors font-semibold border-b border-white/5"
            >
              <Printer className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span>Promotion Flyer Studio</span>
            </button>
            <button 
              onClick={() => { setModalType('terms'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >

              <FileText className="w-4 h-4" />
              Terms & Policy
            </button>
            <button 
              onClick={() => { setModalType('about'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Info className="w-4 h-4" />
              About Us
            </button>
            <button 
              onClick={() => { setModalType('contact'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Contact Us
            </button>
          </div>
        )}
      </div>

      {modalType && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#111111] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 relative">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white">
                {modalType === 'terms' && 'Terms & Policy'}
                {modalType === 'about' && 'About Us'}
                {modalType === 'contact' && 'Contact Us'}
              </h2>
              <button 
                onClick={() => setModalType(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 text-gray-300 space-y-4">
              {modalType === 'terms' && (
                <div className="space-y-4 text-sm leading-relaxed">
                  <p>Welcome to Global News Site. By using our platform, you agree to these terms.</p>
                  <p><strong>Content Usage:</strong> All news and trailers provided on this platform are aggregated from third-party sources. We do not host these videos or articles on our servers.</p>
                  <p><strong>Privacy:</strong> We respect your privacy. If you create an account, your data (email and login activity) is securely stored and never shared with third parties.</p>
                  <p><strong>Liability:</strong> Global News Site is not responsible for the accuracy of external news articles or the availability of external media servers.</p>
                </div>
              )}

              {modalType === 'about' && (
                <div className="space-y-4 text-sm leading-relaxed">
                  <div className="flex justify-center mb-6">
                    <img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain rounded-2xl shadow-lg border border-white/10" />
                  </div>
                  <p><strong>Global News Site</strong> is your premier destination for the latest worldwide headlines and movie entertainment.</p>
                  <p>Our mission is to provide an uninterrupted, fast, and reliable platform to stay updated with global events and enjoy high-quality movie trailers in one seamless experience.</p>
                  <p className="text-center mt-6 text-gray-500 font-medium">Version 1.0.0 &copy; {new Date().getFullYear()}</p>
                </div>
              )}

              {modalType === 'contact' && (
                <div className="space-y-6 text-center">
                  <p className="text-sm">Have a question, feedback, or need support? Reach out to us directly via WhatsApp!</p>
                  <div className="flex justify-center py-4">
                    <a 
                      href="https://wa.me/233205959331" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-6 py-4 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-2xl font-bold transition-transform hover:scale-105 shadow-lg shadow-[#25D366]/20"
                    >
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      Chat on WhatsApp
                    </a>
                  </div>
                  <p className="text-xs text-gray-500">We typically reply within a few hours.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
