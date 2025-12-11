import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  loginWithProvider: (provider: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const storedUser = localStorage.getItem('alsamos_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      name: email.split('@')[0],
      isOnline: true,
    };
    
    setUser(newUser);
    localStorage.setItem('alsamos_user', JSON.stringify(newUser));
    setIsLoading(false);
  };

  const signup = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      name,
      isOnline: true,
    };
    
    setUser(newUser);
    localStorage.setItem('alsamos_user', JSON.stringify(newUser));
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('alsamos_user');
  };

  const loginWithProvider = async (provider: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newUser: User = {
      id: crypto.randomUUID(),
      email: `user@${provider}.com`,
      name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
      isOnline: true,
    };
    
    setUser(newUser);
    localStorage.setItem('alsamos_user', JSON.stringify(newUser));
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        loginWithProvider,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
