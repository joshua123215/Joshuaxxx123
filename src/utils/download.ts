// Modules will be imported dynamically when needed

async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("Proxy fetch failed");
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("CORS fetch failed, falling back to direct URL:", error);
    return imageUrl;
  }
}

export const downloadAsImage = async (elementId: string, filename: string) => {
  try {
    const container = document.getElementById(elementId);
    if (!container) {
      console.error('Element not found');
      return;
    }

    const imgElement = container.querySelector('img');
    const originalSrc = imgElement?.src;

    if (imgElement && imgElement.src && !imgElement.src.startsWith('data:')) {
      const base64Img = await getBase64ImageFromUrl(imgElement.src);
      imgElement.src = base64Img;
    }

    // Add branding temporarily
    const branding = document.createElement('div');
    branding.className = "absolute bottom-4 right-4 z-[9999] flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border border-white/20 shadow-xl";
    branding.innerHTML = `
      <img src="/logo.png" style="width: 24px; height: 24px; object-fit: contain; border-radius: 6px;" crossorigin="anonymous" />
      <span style="color: white; font-weight: bold; font-size: 14px; font-family: sans-serif;">GNS Global News Site</span>
    `;
    
    const computedStyle = window.getComputedStyle(container);
    const originalPosition = container.style.position;
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(branding);
    
    // Wait for render
    await new Promise(resolve => setTimeout(resolve, 200));

    const html2canvas = (await import('html2canvas')).default;

    const canvas = await html2canvas(container, {
      useCORS: true,
      allowTaint: true,
      scale: 3,
      backgroundColor: '#1a1a1a',
      ignoreElements: (element) => element.classList?.contains('no-capture')
    });

    // Cleanup branding and restore image src
    container.removeChild(branding);
    container.style.position = originalPosition;
    if (imgElement && originalSrc) {
      imgElement.src = originalSrc;
    }

    const dataUrl = canvas.toDataURL('image/png');
    
    try {
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.warn('Direct download failed', e);
    }
    
    showFallbackOverlay(dataUrl);

  } catch (error) {
    console.error('Error generating image:', error);
    alert('Failed to generate image. Please try again.');
  }
};

export const downloadAsPDF = async (elementId: string, filename: string) => {
  try {
    const container = document.getElementById(elementId);
    if (!container) {
      console.error('Element not found');
      return;
    }
    
    const imgElement = container.querySelector('img');
    const originalSrc = imgElement?.src;

    if (imgElement && imgElement.src && !imgElement.src.startsWith('data:')) {
      const base64Img = await getBase64ImageFromUrl(imgElement.src);
      imgElement.src = base64Img;
    }
    
    // Add branding temporarily
    const branding = document.createElement('div');
    branding.className = "absolute bottom-4 right-4 z-[9999] flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border border-white/20 shadow-xl";
    branding.innerHTML = `
      <img src="/logo.png" style="width: 24px; height: 24px; object-fit: contain; border-radius: 6px;" crossorigin="anonymous" />
      <span style="color: white; font-weight: bold; font-size: 14px; font-family: sans-serif;">GNS Global News Site</span>
    `;
    
    const computedStyle = window.getComputedStyle(container);
    const originalPosition = container.style.position;
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(branding);
    
    // Wait for render
    await new Promise(resolve => setTimeout(resolve, 200));

    const html2pdf = (await import('html2pdf.js')).default;

    const options = {
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#1a1a1a',
        ignoreElements: (element: Element) => element.classList?.contains('no-capture')
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdfWorker = html2pdf().set(options).from(container);
    
    await pdfWorker.toPdf().get('pdf').then(() => {
        container.removeChild(branding);
        container.style.position = originalPosition;
        if (imgElement && originalSrc) {
          imgElement.src = originalSrc;
        }
    });

    await pdfWorker.save();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  }
};

const showFallbackOverlay = (dataUrl: string) => {
  if (document.getElementById('image-download-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'image-download-overlay';
  overlay.className = 'fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm';
  
  overlay.innerHTML = `
    <div class="max-w-2xl w-full bg-[#1a1a1a] rounded-2xl p-6 border border-white/10 flex flex-col items-center relative">
      <button id="close-overlay-btn" class="absolute top-4 right-4 text-gray-400 hover:text-white bg-black/50 p-2 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
      <h3 class="text-xl font-bold text-white mb-2">Image Ready!</h3>
      <p class="text-gray-400 text-sm mb-6 text-center">If the download didn't start automatically, <strong class="text-white">Long-press</strong> or <strong class="text-white">Right-click</strong> the image below and select <strong class="text-white">"Save Image As..."</strong></p>
      
      <div class="relative w-full overflow-hidden rounded-xl bg-black border border-white/5 flex items-center justify-center max-h-[60vh]">
        <img src="${dataUrl}" class="max-w-full max-h-[60vh] object-contain" alt="Generated Image" />
      </div>
      <button id="retry-download-btn" class="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors w-full sm:w-auto">
        Retry Download
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('close-overlay-btn')?.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  document.getElementById('retry-download-btn')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `download.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
};


function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

export const downloadNativeImage = async (articleData: {
  imageUrl?: string;
  source: string;
  time: string;
  title: string;
  snippet: string;
}, filename: string) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 600;
  canvas.height = 750;

  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawText = (startY: number) => {
    ctx.fillStyle = '#e50914';
    ctx.beginPath();
    ctx.roundRect(20, startY - 30, 140, 30, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('BREAKING NEWS', 32, startY - 10);

    ctx.fillStyle = '#0088ff';
    ctx.font = '600 14px sans-serif';
    ctx.fillText(`${articleData.source} • ${articleData.time}`, 20, startY + 25);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    let nextY = wrapText(ctx, articleData.title, 20, startY + 65, 560, 32);

    ctx.fillStyle = '#b0b0b0';
    ctx.font = '16px sans-serif';
    wrapText(ctx, articleData.snippet, 20, nextY + 15, 560, 24);

    // Branding at bottom
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('GNS Global News Site', 20, canvas.height - 30);
  };

  const finish = () => {
    const dataUrl = canvas.toDataURL('image/png');
    try {
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.warn("Direct download failed", e);
    }
    showFallbackOverlay(dataUrl);
  };

  if (articleData.imageUrl) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(articleData.imageUrl)}`;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      // Calculate aspect ratio to fit width
      const ratio = 600 / img.width;
      const height = img.height * ratio;
      // Draw image
      ctx.drawImage(img, 0, 0, 600, height > 350 ? 350 : height);
      drawText(390);
      finish();
    };
    img.onerror = () => {
      console.warn("Image load failed, drawing text only");
      drawText(70);
      finish();
    };
    img.src = proxyUrl;
  } else {
    drawText(70);
    finish();
  }
};


export const downloadNativePDF = async (articleData: {
  imageUrl?: string;
  source: string;
  time: string;
  title: string;
  snippet: string;
}, filename: string) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 600;
  canvas.height = 750;

  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawText = (startY: number) => {
    ctx.fillStyle = '#e50914';
    ctx.beginPath();
    ctx.roundRect(20, startY - 30, 140, 30, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('BREAKING NEWS', 32, startY - 10);

    ctx.fillStyle = '#0088ff';
    ctx.font = '600 14px sans-serif';
    ctx.fillText(`${articleData.source} • ${articleData.time}`, 20, startY + 25);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    let nextY = wrapText(ctx, articleData.title, 20, startY + 65, 560, 32);

    ctx.fillStyle = '#b0b0b0';
    ctx.font = '16px sans-serif';
    wrapText(ctx, articleData.snippet, 20, nextY + 15, 560, 24);

    // Branding at bottom
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('GNS Global News Site', 20, canvas.height - 30);
  };

  const finish = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const dataUrl = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(dataUrl, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  if (articleData.imageUrl) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(articleData.imageUrl)}`;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      // Calculate aspect ratio to fit width
      const ratio = 600 / img.width;
      const height = img.height * ratio;
      // Draw image
      ctx.drawImage(img, 0, 0, 600, height > 350 ? 350 : height);
      drawText(390);
      finish();
    };
    img.onerror = () => {
      console.warn("Image load failed, drawing text only");
      drawText(70);
      finish();
    };
    img.src = proxyUrl;
  } else {
    drawText(70);
    finish();
  }
};
