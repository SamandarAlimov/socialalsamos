import alsamosLogo from '@/assets/alsamos-logo.png';

interface AlsamosLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-16 w-16',
};

const textSizeMap = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
};

export function AlsamosLogo({ size = 'md', showText = true, className = '' }: AlsamosLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src={alsamosLogo} 
        alt="Alsamos" 
        className={`${sizeMap[size]} object-contain`}
      />
      {showText && (
        <span className={`font-display font-bold ${textSizeMap[size]} bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark bg-clip-text text-transparent`}>
          Alsamos
        </span>
      )}
    </div>
  );
}
