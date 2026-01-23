// Professional Instagram/Snapchat-level filters and effects

export interface FilterEffect {
  id: string;
  name: string;
  category: 'basic' | 'vintage' | 'mood' | 'color' | 'artistic' | 'beauty' | 'seasonal';
  style: string;
  icon?: string;
}

export const FILTER_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'basic', name: 'Basic' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'mood', name: 'Mood' },
  { id: 'color', name: 'Color Pop' },
  { id: 'artistic', name: 'Artistic' },
  { id: 'beauty', name: 'Beauty' },
  { id: 'seasonal', name: 'Seasonal' },
];

export const FILTERS: FilterEffect[] = [
  // Basic Filters
  { id: 'none', name: 'Normal', category: 'basic', style: '' },
  { id: 'clarendon', name: 'Clarendon', category: 'basic', style: 'contrast(120%) saturate(125%)' },
  { id: 'gingham', name: 'Gingham', category: 'basic', style: 'brightness(105%) hue-rotate(-10deg)' },
  { id: 'moon', name: 'Moon', category: 'basic', style: 'grayscale(100%) contrast(110%) brightness(110%)' },
  { id: 'lark', name: 'Lark', category: 'basic', style: 'contrast(90%) saturate(150%) brightness(108%)' },
  { id: 'reyes', name: 'Reyes', category: 'basic', style: 'sepia(22%) contrast(85%) brightness(110%) saturate(75%)' },
  { id: 'juno', name: 'Juno', category: 'basic', style: 'saturate(135%) contrast(115%) brightness(102%)' },
  { id: 'slumber', name: 'Slumber', category: 'basic', style: 'saturate(66%) brightness(105%)' },
  
  // Vintage Filters
  { id: 'nashville', name: 'Nashville', category: 'vintage', style: 'sepia(20%) contrast(120%) saturate(120%) brightness(105%)' },
  { id: '1977', name: '1977', category: 'vintage', style: 'sepia(30%) saturate(140%) contrast(105%)' },
  { id: 'hudson', name: 'Hudson', category: 'vintage', style: 'brightness(120%) contrast(90%) saturate(110%)' },
  { id: 'rise', name: 'Rise', category: 'vintage', style: 'brightness(105%) sepia(10%) saturate(120%) contrast(90%)' },
  { id: 'amaro', name: 'Amaro', category: 'vintage', style: 'hue-rotate(-10deg) contrast(90%) brightness(120%) saturate(150%)' },
  { id: 'valencia', name: 'Valencia', category: 'vintage', style: 'sepia(15%) saturate(150%) contrast(110%) brightness(105%)' },
  { id: 'xpro2', name: 'X-Pro II', category: 'vintage', style: 'sepia(30%) contrast(130%) saturate(140%)' },
  { id: 'lofi', name: 'Lo-Fi', category: 'vintage', style: 'saturate(110%) contrast(150%)' },
  
  // Mood Filters
  { id: 'aden', name: 'Aden', category: 'mood', style: 'hue-rotate(-20deg) contrast(90%) saturate(85%) brightness(120%)' },
  { id: 'perpetua', name: 'Perpetua', category: 'mood', style: 'brightness(105%) saturate(110%) hue-rotate(-5deg)' },
  { id: 'ludwig', name: 'Ludwig', category: 'mood', style: 'saturate(95%) contrast(105%) brightness(103%)' },
  { id: 'earlybird', name: 'Earlybird', category: 'mood', style: 'sepia(20%) contrast(90%) brightness(110%)' },
  { id: 'willow', name: 'Willow', category: 'mood', style: 'grayscale(50%) contrast(95%) brightness(90%)' },
  { id: 'inkwell', name: 'Inkwell', category: 'mood', style: 'grayscale(100%) contrast(110%)' },
  { id: 'mayfair', name: 'Mayfair', category: 'mood', style: 'contrast(110%) saturate(110%) brightness(103%)' },
  { id: 'sierra', name: 'Sierra', category: 'mood', style: 'contrast(85%) saturate(120%) brightness(108%)' },
  
  // Color Pop Filters
  { id: 'teal_orange', name: 'Teal & Orange', category: 'color', style: 'contrast(110%) saturate(130%) hue-rotate(-10deg)' },
  { id: 'pink_tone', name: 'Pink Tone', category: 'color', style: 'hue-rotate(330deg) saturate(120%) brightness(105%)' },
  { id: 'blue_crush', name: 'Blue Crush', category: 'color', style: 'hue-rotate(200deg) saturate(140%) brightness(105%)' },
  { id: 'golden_hour', name: 'Golden Hour', category: 'color', style: 'sepia(25%) saturate(150%) brightness(110%) contrast(105%)' },
  { id: 'neon_city', name: 'Neon City', category: 'color', style: 'saturate(200%) contrast(130%) brightness(110%)' },
  { id: 'purple_haze', name: 'Purple Haze', category: 'color', style: 'hue-rotate(270deg) saturate(150%) brightness(105%)' },
  { id: 'forest', name: 'Forest', category: 'color', style: 'hue-rotate(60deg) saturate(130%) contrast(105%)' },
  { id: 'sunset', name: 'Sunset', category: 'color', style: 'sepia(40%) saturate(180%) hue-rotate(-15deg) brightness(110%)' },
  
  // Artistic Filters
  { id: 'comic', name: 'Comic', category: 'artistic', style: 'contrast(200%) saturate(150%) brightness(105%)' },
  { id: 'noir', name: 'Film Noir', category: 'artistic', style: 'grayscale(100%) contrast(150%) brightness(90%)' },
  { id: 'dramatic', name: 'Dramatic', category: 'artistic', style: 'contrast(150%) saturate(120%) brightness(95%)' },
  { id: 'matte', name: 'Matte', category: 'artistic', style: 'contrast(80%) saturate(90%) brightness(120%)' },
  { id: 'fade', name: 'Fade', category: 'artistic', style: 'contrast(90%) saturate(70%) brightness(115%)' },
  { id: 'cross_process', name: 'Cross Process', category: 'artistic', style: 'hue-rotate(15deg) saturate(150%) contrast(120%)' },
  { id: 'cyanotype', name: 'Cyanotype', category: 'artistic', style: 'grayscale(100%) sepia(100%) hue-rotate(180deg) saturate(300%)' },
  { id: 'chrome', name: 'Chrome', category: 'artistic', style: 'saturate(150%) contrast(140%) brightness(110%)' },
  
  // Beauty Filters
  { id: 'glow', name: 'Glow', category: 'beauty', style: 'brightness(115%) contrast(95%) saturate(110%)' },
  { id: 'soft_skin', name: 'Soft Skin', category: 'beauty', style: 'brightness(108%) contrast(92%) saturate(105%)' },
  { id: 'porcelain', name: 'Porcelain', category: 'beauty', style: 'brightness(110%) contrast(88%) saturate(95%)' },
  { id: 'radiant', name: 'Radiant', category: 'beauty', style: 'brightness(112%) contrast(102%) saturate(115%)' },
  { id: 'bronze', name: 'Bronze', category: 'beauty', style: 'sepia(15%) saturate(130%) contrast(105%) brightness(105%)' },
  { id: 'fresh', name: 'Fresh', category: 'beauty', style: 'brightness(108%) saturate(120%) contrast(100%)' },
  
  // Seasonal Filters
  { id: 'winter', name: 'Winter', category: 'seasonal', style: 'brightness(110%) saturate(80%) hue-rotate(180deg) saturate(20%)' },
  { id: 'spring', name: 'Spring', category: 'seasonal', style: 'brightness(108%) saturate(130%) hue-rotate(30deg)' },
  { id: 'summer', name: 'Summer', category: 'seasonal', style: 'brightness(110%) saturate(140%) sepia(10%)' },
  { id: 'autumn', name: 'Autumn', category: 'seasonal', style: 'sepia(30%) saturate(130%) brightness(105%) hue-rotate(-10deg)' },
  { id: 'christmas', name: 'Christmas', category: 'seasonal', style: 'contrast(110%) saturate(140%) brightness(105%)' },
  { id: 'halloween', name: 'Halloween', category: 'seasonal', style: 'contrast(130%) saturate(150%) hue-rotate(20deg) brightness(95%)' },
];

// Text background colors for stories
export const TEXT_BACKGROUNDS = [
  { id: 'none', name: 'None', color: 'transparent', textColor: 'text-foreground' },
  { id: 'black', name: 'Black', color: 'rgba(0,0,0,0.8)', textColor: 'text-white' },
  { id: 'white', name: 'White', color: 'rgba(255,255,255,0.9)', textColor: 'text-black' },
  { id: 'red', name: 'Red', color: '#ef4444', textColor: 'text-white' },
  { id: 'orange', name: 'Orange', color: '#f97316', textColor: 'text-white' },
  { id: 'amber', name: 'Amber', color: '#f59e0b', textColor: 'text-black' },
  { id: 'yellow', name: 'Yellow', color: '#eab308', textColor: 'text-black' },
  { id: 'lime', name: 'Lime', color: '#84cc16', textColor: 'text-black' },
  { id: 'green', name: 'Green', color: '#22c55e', textColor: 'text-white' },
  { id: 'emerald', name: 'Emerald', color: '#10b981', textColor: 'text-white' },
  { id: 'teal', name: 'Teal', color: '#14b8a6', textColor: 'text-white' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4', textColor: 'text-black' },
  { id: 'sky', name: 'Sky', color: '#0ea5e9', textColor: 'text-white' },
  { id: 'blue', name: 'Blue', color: '#3b82f6', textColor: 'text-white' },
  { id: 'indigo', name: 'Indigo', color: '#6366f1', textColor: 'text-white' },
  { id: 'violet', name: 'Violet', color: '#8b5cf6', textColor: 'text-white' },
  { id: 'purple', name: 'Purple', color: '#a855f7', textColor: 'text-white' },
  { id: 'fuchsia', name: 'Fuchsia', color: '#d946ef', textColor: 'text-white' },
  { id: 'pink', name: 'Pink', color: '#ec4899', textColor: 'text-white' },
  { id: 'rose', name: 'Rose', color: '#f43f5e', textColor: 'text-white' },
  // Gradients
  { id: 'gradient_sunset', name: 'Sunset', color: 'linear-gradient(135deg, #f97316, #ec4899)', textColor: 'text-white' },
  { id: 'gradient_ocean', name: 'Ocean', color: 'linear-gradient(135deg, #06b6d4, #3b82f6)', textColor: 'text-white' },
  { id: 'gradient_forest', name: 'Forest', color: 'linear-gradient(135deg, #22c55e, #14b8a6)', textColor: 'text-white' },
  { id: 'gradient_galaxy', name: 'Galaxy', color: 'linear-gradient(135deg, #6366f1, #a855f7)', textColor: 'text-white' },
  { id: 'gradient_fire', name: 'Fire', color: 'linear-gradient(135deg, #ef4444, #f59e0b)', textColor: 'text-white' },
  { id: 'gradient_aurora', name: 'Aurora', color: 'linear-gradient(135deg, #10b981, #8b5cf6)', textColor: 'text-white' },
  { id: 'gradient_rainbow', name: 'Rainbow', color: 'linear-gradient(135deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7)', textColor: 'text-white' },
];

// Extended music library
export const MUSIC_TRACKS = [
  // Popular
  { id: '1', name: 'Chill Vibes', artist: 'Alsamos Music', duration: 30, category: 'trending', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3' },
  { id: '2', name: 'Summer Days', artist: 'Mood Beats', duration: 30, category: 'trending', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-04.mp3' },
  { id: '3', name: 'Night Drive', artist: 'Lo-Fi House', duration: 30, category: 'chill', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-03.mp3' },
  { id: '4', name: 'Golden Hour', artist: 'Sunset Sound', duration: 30, category: 'mood', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-02.mp3' },
  { id: '5', name: 'City Lights', artist: 'Urban Mix', duration: 30, category: 'upbeat', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3' },
  // Chill
  { id: '6', name: 'Peaceful Mind', artist: 'Ambient Dreams', duration: 30, category: 'chill', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3' },
  { id: '7', name: 'Morning Coffee', artist: 'Café Beats', duration: 30, category: 'chill', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-04.mp3' },
  { id: '8', name: 'Rainy Day', artist: 'Mood Music', duration: 30, category: 'chill', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-03.mp3' },
  // Upbeat
  { id: '9', name: 'Dance Floor', artist: 'EDM Collective', duration: 30, category: 'upbeat', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-02.mp3' },
  { id: '10', name: 'Party Night', artist: 'Club Mix', duration: 30, category: 'upbeat', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3' },
  { id: '11', name: 'Energy Boost', artist: 'Workout Beats', duration: 30, category: 'upbeat', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3' },
  // Mood
  { id: '12', name: 'Romantic Evening', artist: 'Love Songs', duration: 30, category: 'mood', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-04.mp3' },
  { id: '13', name: 'Sad Melody', artist: 'Emotional Piano', duration: 30, category: 'mood', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-03.mp3' },
  { id: '14', name: 'Happy Vibes', artist: 'Feel Good Mix', duration: 30, category: 'mood', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-02.mp3' },
  // Viral
  { id: '15', name: 'TikTok Hit', artist: 'Viral Sounds', duration: 30, category: 'trending', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3' },
  { id: '16', name: 'Trending Now', artist: 'Chart Toppers', duration: 30, category: 'trending', url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3' },
];

export const MUSIC_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'trending', name: '🔥 Trending' },
  { id: 'chill', name: '😌 Chill' },
  { id: 'upbeat', name: '🎉 Upbeat' },
  { id: 'mood', name: '💕 Mood' },
];
