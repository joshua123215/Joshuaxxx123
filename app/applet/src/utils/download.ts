import html2canvas from 'html2canvas';

export const downloadAsImage = async (elementId: string, filename: string) => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error('Element not found');
      return;
    }
    
    // Temporarily hide elements with .no-capture
    const noCaptures = element.querySelectorAll('.no-capture');
    const originalDisplays: string[] = [];
    noCaptures.forEach((el) => {
      originalDisplays.push((el as HTMLElement).style.display);
      (el as HTMLElement).style.display = 'none';
    });

    // Create and add branding temporarily
    const branding = document.createElement('div');
    branding.className = "absolute bottom-4 right-4 z-50 flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border border-white/20 shadow-xl";
    branding.innerHTML = `
      <img src="/logo.jpg" style="width: 24px; height: 24px; object-fit: cover; border-radius: 6px;" crossorigin="anonymous" />
      <span style="color: white; font-weight: bold; font-size: 14px; font-family: sans-serif;">GlobalNews.site</span>
    `;
    
    const originalPosition = element.style.position;
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      element.style.position = 'relative';
    }
    
    element.appendChild(branding);

    // Wait for styles/images to apply
    await new Promise(resolve => setTimeout(resolve, 100));

    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#1a1a1a',
      scale: 2,
    });

    // Cleanup branding and restore element state
    element.removeChild(branding);
    element.style.position = originalPosition;
    
    // Restore .no-capture elements
    noCaptures.forEach((el, index) => {
      (el as HTMLElement).style.display = originalDisplays[index];
    });

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Error generating image:', error);
  }
};
