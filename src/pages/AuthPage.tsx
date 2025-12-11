import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AlsamosLogo } from '@/components/AlsamosLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Mail, 
  Lock, 
  User, 
  Phone,
  Loader2,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'sonner';

type AuthMode = 'login' | 'signup';

// Social icons as components
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

const AlsamosIcon = () => (
  <div className="h-5 w-5 rounded bg-gradient-to-br from-alsamos-orange-light to-alsamos-orange-dark flex items-center justify-center">
    <span className="text-xs font-bold text-primary-foreground">A</span>
  </div>
);

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, signup, loginWithProvider } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await signup(email, password, name);
        toast.success('Account created successfully!');
      }
      navigate('/home');
    } catch (error) {
      toast.error('Authentication failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setIsSubmitting(true);
    try {
      await loginWithProvider(provider);
      toast.success(`Logged in with ${provider}!`);
      navigate('/home');
    } catch (error) {
      toast.error(`Failed to login with ${provider}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-transparent rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-primary/10 via-transparent to-transparent rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
      </div>

      {/* Auth Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="glass-strong rounded-3xl p-8 shadow-lg animate-scale-in">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <AlsamosLogo size="xl" className="mb-4" />
            <p className="text-muted-foreground text-center text-sm max-w-xs">
              Welcome to the next generation of intelligent social connectivity.
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                mode === 'login' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                mode === 'signup' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={<User className="h-4 w-4" />}
                required
              />
            )}
            
            <Input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="h-4 w-4" />}
              required
            />
            
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="h-4 w-4" />}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button 
              type="submit" 
              variant="hero" 
              size="lg" 
              className="w-full mt-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or continue with</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => toast.info('Alsamos ID login coming soon!')}
              disabled={isSubmitting}
            >
              <AlsamosIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => handleSocialLogin('google')}
              disabled={isSubmitting}
            >
              <GoogleIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => handleSocialLogin('apple')}
              disabled={isSubmitting}
            >
              <AppleIcon />
            </Button>
          </div>

          {/* Phone Login Option */}
          <Button
            type="button"
            variant="ghost"
            className="w-full mt-4 text-muted-foreground"
            onClick={() => toast.info('Phone login coming soon!')}
            disabled={isSubmitting}
          >
            <Phone className="h-4 w-4 mr-2" />
            Sign in with Phone Number
          </Button>

          {/* Footer Links */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <span>•</span>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <span>•</span>
              <a href="#" className="hover:text-foreground transition-colors">Help Center</a>
            </div>
          </div>
        </div>

        {/* Create Account Link (for signup flow to accounts.alsamos.com) */}
        <p className="text-center mt-6 text-sm text-muted-foreground">
          Need an Alsamos Account?{' '}
          <a href="https://accounts.alsamos.com/signup" className="text-primary hover:underline font-medium">
            Create Account
          </a>
        </p>
      </div>
    </div>
  );
}
