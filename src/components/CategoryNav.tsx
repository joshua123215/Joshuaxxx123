import React, { useEffect, useRef } from 'react';

const CATEGORIES = [
  "Top Stories", "Ghana", "World", "Politics", "Business", 
  "Technology", "Sports", "Entertainment", "Health"
];

interface CategoryNavProps {
  activeCategory: string;
  onSelectCategory: (cat: string) => void;
}

export default function CategoryNav({ activeCategory, onSelectCategory }: CategoryNavProps) {
  return (
    <div className="w-full overflow-x-auto hide-scrollbar bg-[#0a0a0a] border-b border-white/5 py-3">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 min-w-max">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelectCategory(cat)}
            className={`text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeCategory === cat ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {cat}
            {activeCategory === cat && (
              <span className="absolute -bottom-4 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
