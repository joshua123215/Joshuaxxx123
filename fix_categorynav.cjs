const fs = require('fs');

let code = fs.readFileSync('src/components/CategoryNav.tsx', 'utf8');
code = code.replace(/import React from 'react';/, "import React, { useEffect, useRef } from 'react';");

const newComponent = `export default function CategoryNav({ activeCategory, onSelectCategory }: CategoryNavProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeButton = scrollContainerRef.current.querySelector('[data-active="true"]') as HTMLElement;
      if (activeButton) {
        const container = scrollContainerRef.current;
        const scrollLeft = activeButton.offsetLeft - container.offsetWidth / 2 + activeButton.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [activeCategory]);

  return (
    <div ref={scrollContainerRef} className="w-full overflow-x-auto hide-scrollbar bg-[#0a0a0a] border-b border-white/5 py-3">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 min-w-max">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            data-active={activeCategory === cat}
            onClick={() => onSelectCategory(cat)}
            className={\`text-sm font-medium whitespace-nowrap transition-colors relative \${
              activeCategory === cat ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            }\`}
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
}`;

code = code.replace(/export default function CategoryNav[\s\S]*?\}\);\}\s*<\/div>\s*<\/div>\s*\);\s*\}/, newComponent);

fs.writeFileSync('src/components/CategoryNav.tsx', code);
