// Live Camera Effects - Instagram/Snapchat style effects for camera and live streams

export interface CameraEffect {
  id: string;
  name: string;
  emoji: string;
  category: 'face' | 'beauty' | 'fun' | 'ar' | 'background' | 'color';
  type: 'overlay' | 'filter' | 'mask' | 'background';
  description?: string;
}

export const EFFECT_CATEGORIES = [
  { id: 'all', name: 'All', emoji: '✨' },
  { id: 'face', name: 'Face', emoji: '😊' },
  { id: 'beauty', name: 'Beauty', emoji: '💄' },
  { id: 'fun', name: 'Fun', emoji: '🎉' },
  { id: 'ar', name: 'AR', emoji: '🌟' },
  { id: 'background', name: 'Background', emoji: '🖼️' },
  { id: 'color', name: 'Color', emoji: '🎨' },
];

export const CAMERA_EFFECTS: CameraEffect[] = [
  // Face Effects
  { id: 'none', name: 'None', emoji: '✨', category: 'face', type: 'overlay' },
  { id: 'dog_face', name: 'Dog', emoji: '🐶', category: 'face', type: 'mask', description: 'Cute dog ears and nose' },
  { id: 'cat_face', name: 'Cat', emoji: '🐱', category: 'face', type: 'mask', description: 'Adorable cat ears and whiskers' },
  { id: 'bunny_face', name: 'Bunny', emoji: '🐰', category: 'face', type: 'mask', description: 'Fluffy bunny ears' },
  { id: 'fox_face', name: 'Fox', emoji: '🦊', category: 'face', type: 'mask', description: 'Clever fox mask' },
  { id: 'bear_face', name: 'Bear', emoji: '🐻', category: 'face', type: 'mask', description: 'Cuddly bear ears' },
  { id: 'panda_face', name: 'Panda', emoji: '🐼', category: 'face', type: 'mask', description: 'Cute panda eyes' },
  { id: 'koala_face', name: 'Koala', emoji: '🐨', category: 'face', type: 'mask', description: 'Sweet koala ears' },
  { id: 'lion_face', name: 'Lion', emoji: '🦁', category: 'face', type: 'mask', description: 'Majestic lion mane' },
  { id: 'unicorn_face', name: 'Unicorn', emoji: '🦄', category: 'face', type: 'mask', description: 'Magical unicorn horn' },
  { id: 'alien_face', name: 'Alien', emoji: '👽', category: 'face', type: 'mask', description: 'Out of this world' },
  { id: 'devil_face', name: 'Devil', emoji: '😈', category: 'face', type: 'mask', description: 'Devilish horns' },
  { id: 'angel_face', name: 'Angel', emoji: '😇', category: 'face', type: 'mask', description: 'Angelic halo' },
  
  // Beauty Effects
  { id: 'smooth_skin', name: 'Smooth', emoji: '✨', category: 'beauty', type: 'filter', description: 'Smooth skin filter' },
  { id: 'bright_eyes', name: 'Bright Eyes', emoji: '👁️', category: 'beauty', type: 'filter', description: 'Enhance eye brightness' },
  { id: 'rosy_cheeks', name: 'Rosy Cheeks', emoji: '🌸', category: 'beauty', type: 'overlay', description: 'Natural blush effect' },
  { id: 'lip_gloss', name: 'Lip Gloss', emoji: '💋', category: 'beauty', type: 'overlay', description: 'Glossy lips' },
  { id: 'face_slim', name: 'Face Slim', emoji: '💎', category: 'beauty', type: 'filter', description: 'Slim face effect' },
  { id: 'big_eyes', name: 'Big Eyes', emoji: '👀', category: 'beauty', type: 'filter', description: 'Larger eye effect' },
  { id: 'small_nose', name: 'Small Nose', emoji: '👃', category: 'beauty', type: 'filter', description: 'Refine nose shape' },
  { id: 'contour', name: 'Contour', emoji: '💄', category: 'beauty', type: 'overlay', description: 'Face contouring' },
  
  // Fun Effects
  { id: 'crown', name: 'Crown', emoji: '👑', category: 'fun', type: 'overlay', description: 'Royal crown' },
  { id: 'sunglasses', name: 'Sunglasses', emoji: '😎', category: 'fun', type: 'overlay', description: 'Cool shades' },
  { id: 'party_hat', name: 'Party Hat', emoji: '🎉', category: 'fun', type: 'overlay', description: 'Celebration hat' },
  { id: 'mustache', name: 'Mustache', emoji: '🥸', category: 'fun', type: 'overlay', description: 'Fancy mustache' },
  { id: 'beard', name: 'Beard', emoji: '🧔', category: 'fun', type: 'overlay', description: 'Full beard' },
  { id: 'pirate', name: 'Pirate', emoji: '🏴‍☠️', category: 'fun', type: 'overlay', description: 'Pirate eye patch' },
  { id: 'cowboy', name: 'Cowboy', emoji: '🤠', category: 'fun', type: 'overlay', description: 'Cowboy hat' },
  { id: 'clown', name: 'Clown', emoji: '🤡', category: 'fun', type: 'mask', description: 'Colorful clown face' },
  { id: 'superhero', name: 'Superhero', emoji: '🦸', category: 'fun', type: 'mask', description: 'Hero mask' },
  { id: 'nerd', name: 'Nerd', emoji: '🤓', category: 'fun', type: 'overlay', description: 'Nerdy glasses' },
  
  // AR Effects
  { id: 'hearts_float', name: 'Hearts', emoji: '💕', category: 'ar', type: 'overlay', description: 'Floating hearts' },
  { id: 'stars_sparkle', name: 'Sparkles', emoji: '✨', category: 'ar', type: 'overlay', description: 'Sparkling stars' },
  { id: 'fire_aura', name: 'Fire', emoji: '🔥', category: 'ar', type: 'overlay', description: 'Fiery aura' },
  { id: 'rainbow_arc', name: 'Rainbow', emoji: '🌈', category: 'ar', type: 'overlay', description: 'Rainbow arc' },
  { id: 'snow_fall', name: 'Snow', emoji: '❄️', category: 'ar', type: 'overlay', description: 'Falling snow' },
  { id: 'butterflies', name: 'Butterflies', emoji: '🦋', category: 'ar', type: 'overlay', description: 'Flying butterflies' },
  { id: 'flowers_bloom', name: 'Flowers', emoji: '🌸', category: 'ar', type: 'overlay', description: 'Blooming flowers' },
  { id: 'confetti', name: 'Confetti', emoji: '🎊', category: 'ar', type: 'overlay', description: 'Party confetti' },
  { id: 'bubbles', name: 'Bubbles', emoji: '🫧', category: 'ar', type: 'overlay', description: 'Floating bubbles' },
  { id: 'lightning', name: 'Lightning', emoji: '⚡', category: 'ar', type: 'overlay', description: 'Electric sparks' },
  { id: 'galaxy', name: 'Galaxy', emoji: '🌌', category: 'ar', type: 'overlay', description: 'Cosmic stars' },
  { id: 'neon_glow', name: 'Neon', emoji: '💜', category: 'ar', type: 'overlay', description: 'Neon glow outline' },
  
  // Background Effects
  { id: 'blur_bg', name: 'Blur', emoji: '🌫️', category: 'background', type: 'background', description: 'Blur background' },
  { id: 'replace_beach', name: 'Beach', emoji: '🏖️', category: 'background', type: 'background', description: 'Beach background' },
  { id: 'replace_city', name: 'City', emoji: '🌆', category: 'background', type: 'background', description: 'City skyline' },
  { id: 'replace_space', name: 'Space', emoji: '🚀', category: 'background', type: 'background', description: 'Space background' },
  { id: 'replace_nature', name: 'Nature', emoji: '🌲', category: 'background', type: 'background', description: 'Forest background' },
  { id: 'replace_studio', name: 'Studio', emoji: '🎬', category: 'background', type: 'background', description: 'Studio backdrop' },
  
  // Color Effects
  { id: 'vintage_tone', name: 'Vintage', emoji: '📸', category: 'color', type: 'filter', description: 'Vintage color tone' },
  { id: 'cyberpunk', name: 'Cyberpunk', emoji: '🌃', category: 'color', type: 'filter', description: 'Neon cyberpunk' },
  { id: 'black_white', name: 'B&W', emoji: '🖤', category: 'color', type: 'filter', description: 'Classic black & white' },
  { id: 'warm_glow', name: 'Warm', emoji: '🌅', category: 'color', type: 'filter', description: 'Warm golden tones' },
  { id: 'cool_blue', name: 'Cool', emoji: '💙', category: 'color', type: 'filter', description: 'Cool blue tones' },
  { id: 'dramatic', name: 'Dramatic', emoji: '🎭', category: 'color', type: 'filter', description: 'High contrast drama' },
  { id: 'dreamy', name: 'Dreamy', emoji: '💭', category: 'color', type: 'filter', description: 'Soft dreamy look' },
  { id: 'pop_art', name: 'Pop Art', emoji: '🎨', category: 'color', type: 'filter', description: 'Bold pop colors' },
];

// Get CSS filter style for color effects
export function getEffectFilterStyle(effectId: string): string {
  const filterStyles: Record<string, string> = {
    none: '',
    vintage_tone: 'sepia(40%) contrast(110%) brightness(105%)',
    cyberpunk: 'saturate(200%) contrast(130%) hue-rotate(280deg)',
    black_white: 'grayscale(100%) contrast(120%)',
    warm_glow: 'sepia(25%) saturate(130%) brightness(110%)',
    cool_blue: 'saturate(120%) hue-rotate(180deg) brightness(105%)',
    dramatic: 'contrast(150%) saturate(130%) brightness(95%)',
    dreamy: 'brightness(115%) saturate(80%) contrast(90%) blur(0.5px)',
    pop_art: 'saturate(250%) contrast(140%)',
    smooth_skin: 'brightness(105%) contrast(95%)',
    bright_eyes: 'brightness(110%) contrast(105%)',
    face_slim: 'contrast(102%)',
    big_eyes: 'brightness(102%)',
    small_nose: 'brightness(101%)',
  };
  
  return filterStyles[effectId] || '';
}
