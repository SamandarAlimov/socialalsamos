import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { supabase } from '@/integrations/supabase/client';
import { 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Globe, 
  Smartphone,
  Key,
  Eye,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Wifi,
  Trash2,
  Monitor,
  Laptop,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  BadgeCheck,
  Wallet,
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Clock,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { VerificationRequestDialog } from '@/components/profile/VerificationRequestDialog';

interface Profile {
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  website: string | null;
  country: string | null;
  birth_date: string | null;
}

// Push Notification Settings Component
function PushNotificationSettings() {
  const { permission, supported, requestPermission } = useNotificationPermission();
  const { toast } = useToast();

  const handleEnablePush = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({
        title: 'Push Notifications Enabled',
        description: 'You will now receive notifications when the app is in background.',
      });
    } else {
      toast({
        title: 'Permission Denied',
        description: 'Please enable notifications in your browser settings.',
        variant: 'destructive',
      });
    }
  };

  if (!supported) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Push Notifications</p>
            <p className="text-xs text-muted-foreground">Not supported in this browser</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold">Push Notifications</h2>
      </div>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Browser Notifications</p>
            <p className="text-xs text-muted-foreground">
              {permission === 'granted'
                ? 'Enabled - You will receive alerts when app is in background'
                : permission === 'denied'
                ? 'Blocked - Enable in browser settings'
                : 'Enable to get notified of likes, comments, and follows'}
            </p>
          </div>
        </div>
        {permission === 'granted' ? (
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Enabled</span>
          </div>
        ) : permission === 'denied' ? (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Blocked</span>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={handleEnablePush}>
            Enable
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { settings, sessions, isLoading, updateSettings, logoutSession, logoutAllOtherSessions, refetch } = useUserSettings();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<Profile>({
    display_name: '',
    username: '',
    bio: '',
    avatar_url: null,
    location: '',
    website: '',
    country: null,
    birth_date: null,
  });
  const [saving, setSaving] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setProfile({
          display_name: data.display_name || '',
          username: data.username || '',
          bio: data.bio || '',
          avatar_url: data.avatar_url,
          location: data.location || '',
          website: data.website || '',
          country: data.country || null,
          birth_date: data.birth_date || null,
        });
      }
    };

    fetchProfile();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: profile.display_name,
          username: profile.username,
          bio: profile.bio,
          location: profile.location,
          website: profile.website,
          country: profile.country,
          birth_date: profile.birth_date,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been saved successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('message-attachments')
      .upload(fileName, file);

    if (uploadError) {
      toast({ title: 'Error', description: 'Failed to upload avatar', variant: 'destructive' });
      return;
    }

    const { data: urlData } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(fileName);

    const avatarUrl = urlData.publicUrl;
    
    await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
    toast({ title: 'Success', description: 'Avatar updated' });
  };

  const handleLogoutSession = async () => {
    if (!selectedSessionId) return;
    await logoutSession(selectedSessionId);
    setLogoutDialogOpen(false);
    setSelectedSessionId(null);
  };

  const handleLogoutAllOthers = async () => {
    await logoutAllOtherSessions();
    setLogoutAllDialogOpen(false);
  };

  const getDeviceIcon = (deviceType: string | null) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Laptop;
      default:
        return Monitor;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-4 md:py-8 px-3 md:px-4 pb-24 md:pb-8">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-8">Settings</h1>

      <Tabs defaultValue="account" className="space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="account" className="text-xs md:text-sm py-2">Account</TabsTrigger>
          <TabsTrigger value="privacy" className="text-xs md:text-sm py-2">Privacy</TabsTrigger>
          <TabsTrigger value="devices" className="text-xs md:text-sm py-2">Devices</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs md:text-sm py-2">Notif.</TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold mb-6">Personal Information</h2>
            
            {/* Avatar */}
            <div className="flex items-center gap-6 mb-6">
              <label className="relative cursor-pointer group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="text-xl">
                    {profile.display_name?.[0] || user?.email?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-white text-xs">Change</span>
                </div>
              </label>
              <div>
                <p className="font-medium">{profile.display_name || 'No name set'}</p>
                <p className="text-sm text-muted-foreground">@{profile.username || 'username'}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    value={profile.display_name || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, display_name: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={profile.username || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, username: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={profile.bio || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                  className="mt-1.5 resize-none"
                  rows={3}
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={profile.location || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, location: e.target.value }))}
                    className="mt-1.5"
                    placeholder="City, Country"
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={profile.website || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, website: e.target.value }))}
                    className="mt-1.5"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="country">Davlat</Label>
                  <Select 
                    value={profile.country || ''} 
                    onValueChange={(value) => setProfile(prev => ({ ...prev, country: value }))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Davlatingizni tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Uzbekistan">🇺🇿 O'zbekiston</SelectItem>
                      <SelectItem value="Russia">🇷🇺 Rossiya</SelectItem>
                      <SelectItem value="Kazakhstan">🇰🇿 Qozog'iston</SelectItem>
                      <SelectItem value="Kyrgyzstan">🇰🇬 Qirg'iziston</SelectItem>
                      <SelectItem value="Tajikistan">🇹🇯 Tojikiston</SelectItem>
                      <SelectItem value="Turkmenistan">🇹🇲 Turkmaniston</SelectItem>
                      <SelectItem value="Turkey">🇹🇷 Turkiya</SelectItem>
                      <SelectItem value="United States">🇺🇸 AQSh</SelectItem>
                      <SelectItem value="United Kingdom">🇬🇧 Buyuk Britaniya</SelectItem>
                      <SelectItem value="Germany">🇩🇪 Germaniya</SelectItem>
                      <SelectItem value="France">🇫🇷 Fransiya</SelectItem>
                      <SelectItem value="Italy">🇮🇹 Italiya</SelectItem>
                      <SelectItem value="Spain">🇪🇸 Ispaniya</SelectItem>
                      <SelectItem value="South Korea">🇰🇷 Janubiy Koreya</SelectItem>
                      <SelectItem value="Japan">🇯🇵 Yaponiya</SelectItem>
                      <SelectItem value="China">🇨🇳 Xitoy</SelectItem>
                      <SelectItem value="India">🇮🇳 Hindiston</SelectItem>
                      <SelectItem value="UAE">🇦🇪 BAA</SelectItem>
                      <SelectItem value="Saudi Arabia">🇸🇦 Saudiya Arabistoni</SelectItem>
                      <SelectItem value="Other">🌍 Boshqa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="birth_date">Tug'ilgan sana</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={profile.birth_date || ''}
                    onChange={(e) => setProfile(prev => ({ ...prev, birth_date: e.target.value }))}
                    className="mt-1.5"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving} className="mt-6">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>

          {/* Payment */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Payment</h3>
                  <p className="text-sm text-muted-foreground">Wallet balance and transaction history</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate('/payment')}>Open</Button>
            </div>
          </div>

          {/* Verification Request */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <BadgeCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Get Verified</h3>
                  <p className="text-sm text-muted-foreground">Request a verified badge for your account</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => setVerificationDialogOpen(true)}>
                Request
              </Button>
            </div>
          </div>

          {/* Activity / Your Time */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Sizning faolligingiz</h3>
                  <p className="text-sm text-muted-foreground">Platformada sarflagan vaqtingiz va statistikalar</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate('/activity')}>
                <Clock className="h-4 w-4 mr-2" />
                Ko'rish
              </Button>
            </div>
          </div>

          {/* Theme Settings */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Appearance</h2>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  {theme === 'dark' ? (
                    <Moon className="h-5 w-5 text-muted-foreground" />
                  ) : theme === 'light' ? (
                    <Sun className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">Theme</p>
                  <p className="text-xs text-muted-foreground">Choose your preferred appearance</p>
                </div>
              </div>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      System
                    </div>
                  </SelectItem>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Dark
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Logout */}
          <div className="pt-4">
            <Button 
              variant="destructive" 
              className="w-full" 
              onClick={logout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log Out
            </Button>
          </div>

          {/* Delete Account */}
          <div className="bg-card rounded-xl border border-destructive/30 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-destructive">Delete Account</h3>
                <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Once you delete your account, there is no going back. All your posts, messages, and personal data will be permanently removed.
            </p>
            <Button 
              variant="destructive" 
              onClick={() => setDeleteAccountDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete My Account
            </Button>
          </div>

          <VerificationRequestDialog 
            open={verificationDialogOpen} 
            onOpenChange={setVerificationDialogOpen} 
          />

          {/* Delete Account Confirmation Dialog */}
          <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Delete Account</AlertDialogTitle>
                <AlertDialogDescription className="space-y-4">
                  <p>
                    This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
                  </p>
                  <p>
                    To confirm, please type <span className="font-semibold">DELETE</span> below:
                  </p>
                  <Input 
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="mt-2"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                  onClick={async () => {
                    setDeletingAccount(true);
                    try {
                      // Delete user profile and related data (cascades will handle related tables)
                      const { error: profileError } = await supabase
                        .from('profiles')
                        .delete()
                        .eq('id', user?.id);
                      
                      if (profileError) throw profileError;

                      // Sign out the user
                      await supabase.auth.signOut();
                      
                      toast({
                        title: 'Account Deleted',
                        description: 'Your account has been permanently deleted.',
                      });
                      
                      navigate('/');
                    } catch (error: any) {
                      toast({
                        title: 'Error',
                        description: error.message || 'Failed to delete account',
                        variant: 'destructive',
                      });
                    } finally {
                      setDeletingAccount(false);
                      setDeleteAccountDialogOpen(false);
                      setDeleteConfirmText('');
                    }
                  }}
                >
                  {deletingAccount ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete Account
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Privacy Settings</h2>
            </div>

            <div className="divide-y divide-border">
              {/* Last Seen Visibility */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Last Seen</p>
                    <p className="text-xs text-muted-foreground">Who can see when you were online</p>
                  </div>
                </div>
                <Select
                  value={settings?.last_seen_visibility || 'everyone'}
                  onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ last_seen_visibility: value })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="contacts">Contacts</SelectItem>
                    <SelectItem value="nobody">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Read Receipts */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Read Receipts</p>
                    <p className="text-xs text-muted-foreground">Let others know when you've read messages</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.read_receipts_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings({ read_receipts_enabled: checked })}
                />
              </div>

              {/* Call Permissions */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Wifi className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Who Can Call Me</p>
                    <p className="text-xs text-muted-foreground">Control who can start calls with you</p>
                  </div>
                </div>
                <Select
                  value={settings?.call_permissions || 'everyone'}
                  onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ call_permissions: value })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="contacts">Contacts</SelectItem>
                    <SelectItem value="nobody">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Group Invite Permissions */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Group Invites</p>
                    <p className="text-xs text-muted-foreground">Who can add you to groups</p>
                  </div>
                </div>
                <Select
                  value={settings?.group_invite_permissions || 'everyone'}
                  onValueChange={(value: 'everyone' | 'contacts' | 'nobody') => updateSettings({ group_invite_permissions: value })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="contacts">Contacts</SelectItem>
                    <SelectItem value="nobody">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Two Factor */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Add extra security to your account</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.two_factor_enabled ?? false}
                  onCheckedChange={(checked) => updateSettings({ two_factor_enabled: checked })}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-6">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Active Sessions</h2>
                <p className="text-sm text-muted-foreground">{sessions.length} device{sessions.length !== 1 ? 's' : ''} logged in</p>
              </div>
              {sessions.length > 1 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setLogoutAllDialogOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Logout All Others
                </Button>
              )}
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="divide-y divide-border">
                {sessions.map((session) => {
                  const DeviceIcon = getDeviceIcon(session.device_type);
                  return (
                    <div key={session.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          <DeviceIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {session.device_name || session.browser_name || 'Unknown Device'}
                            </p>
                            {session.is_current && (
                              <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {session.os_name && `${session.os_name} • `}
                            {session.browser_name && `${session.browser_name} • `}
                            {session.ip_address || 'Unknown IP'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last active: {session.last_active_at 
                              ? formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true })
                              : 'Unknown'}
                          </p>
                        </div>
                      </div>
                      {!session.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedSessionId(session.id);
                            setLogoutDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <PushNotificationSettings />

          {/* Autoplay Settings */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Media Autoplay</h2>
              <p className="text-xs text-muted-foreground mt-1">Control auto-playing media in messages</p>
            </div>

            <div className="divide-y divide-border">
              {/* Autoplay Voice Messages */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Voice Messages</p>
                    <p className="text-xs text-muted-foreground">Auto-play voice messages when visible</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.autoplay_voice_messages ?? true}
                  onCheckedChange={(checked) => updateSettings({ autoplay_voice_messages: checked })}
                />
              </div>

              {/* Autoplay Video Messages */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Video Messages</p>
                    <p className="text-xs text-muted-foreground">Auto-play video messages when visible</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.autoplay_video_messages ?? true}
                  onCheckedChange={(checked) => updateSettings({ autoplay_video_messages: checked })}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Notification Types</h2>
              <p className="text-xs text-muted-foreground mt-1">Choose which notifications you want to receive</p>
            </div>

            <div className="divide-y divide-border">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <Heart className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Likes</p>
                    <p className="text-xs text-muted-foreground">When someone likes your posts</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_likes ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_likes: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Comments</p>
                    <p className="text-xs text-muted-foreground">When someone comments on your posts</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_comments ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_comments: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <UserPlus className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">New Followers</p>
                    <p className="text-xs text-muted-foreground">When someone starts following you</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_follows ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_follows: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <AtSign className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Mentions</p>
                    <p className="text-xs text-muted-foreground">When someone @mentions you</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notify_mentions ?? true}
                  onCheckedChange={(checked) => updateSettings({ notify_mentions: checked })}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Notification Preferences</h2>
            </div>

            <div className="divide-y divide-border">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Notification Sounds</p>
                    <p className="text-xs text-muted-foreground">Play sounds for new messages</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notification_sounds ?? true}
                  onCheckedChange={(checked) => updateSettings({ notification_sounds: checked })}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Message Preview</p>
                    <p className="text-xs text-muted-foreground">Show message content in notifications</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.notification_preview ?? true}
                  onCheckedChange={(checked) => updateSettings({ notification_preview: checked })}
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pt-8">
        <p>Alsamos Social v1.0.0</p>
        <p className="mt-1">© 2024 Alsamos. All rights reserved.</p>
      </div>

      {/* Logout Session Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout Device</AlertDialogTitle>
            <AlertDialogDescription>
              This will log out the selected device. The user will need to sign in again on that device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutSession}>
              Logout Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout All Others Dialog */}
      <AlertDialog open={logoutAllDialogOpen} onOpenChange={setLogoutAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout All Other Devices</AlertDialogTitle>
            <AlertDialogDescription>
              This will log out all devices except your current one. You will remain logged in on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutAllOthers}>
              Logout All Others
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
