import { useAuth } from '@/contexts/AuthContext';
import { 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Globe, 
  HardDrive, 
  Smartphone,
  Key,
  Eye,
  Moon,
  LogOut,
  ChevronRight,
  Wifi
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface SettingItem {
  icon: React.ElementType;
  label: string;
  description?: string;
  action?: 'link' | 'toggle' | 'button';
  value?: boolean;
}

interface SettingSection {
  title: string;
  items: SettingItem[];
}

const settings: SettingSection[] = [
  {
    title: 'Account',
    items: [
      { icon: User, label: 'Personal Information', description: 'Update your profile details', action: 'link' },
      { icon: Key, label: 'Password & Security', description: 'Manage your password and 2FA', action: 'link' },
      { icon: Smartphone, label: 'Devices', description: '5 active sessions', action: 'link' },
    ],
  },
  {
    title: 'Privacy',
    items: [
      { icon: Eye, label: 'Profile Visibility', description: 'Control who can see your profile', action: 'link' },
      { icon: Shield, label: 'Blocked Users', description: '3 blocked users', action: 'link' },
      { icon: Wifi, label: 'Online Status', description: 'Show when you\'re online', action: 'toggle', value: true },
    ],
  },
  {
    title: 'Notifications',
    items: [
      { icon: Bell, label: 'Push Notifications', description: 'Receive push notifications', action: 'toggle', value: true },
      { icon: Bell, label: 'Email Notifications', description: 'Receive email updates', action: 'toggle', value: false },
    ],
  },
  {
    title: 'Appearance',
    items: [
      { icon: Moon, label: 'Dark Mode', description: 'Use dark theme', action: 'toggle', value: true },
      { icon: Palette, label: 'Theme Color', description: 'Alsamos Orange', action: 'link' },
      { icon: Globe, label: 'Language', description: 'English (US)', action: 'link' },
    ],
  },
  {
    title: 'Storage & Data',
    items: [
      { icon: HardDrive, label: 'Storage Usage', description: '2.4 GB used', action: 'link' },
      { icon: HardDrive, label: 'Alsamos Drive Sync', description: 'Connected', action: 'link' },
    ],
  },
];

export default function SettingsPage() {
  const { logout } = useAuth();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      <div className="space-y-8">
        {settings.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {section.title}
            </h2>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {section.items.map((item, index) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between p-4 hover:bg-accent/50 transition-colors cursor-pointer ${
                    index !== section.items.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                  </div>
                  
                  {item.action === 'toggle' ? (
                    <Switch defaultChecked={item.value} />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

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

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pt-4">
          <p>Alsamos Social v1.0.0</p>
          <p className="mt-1">© 2024 Alsamos. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
