import { 
  Users, 
  UserCheck, 
  UserPlus, 
  MessageSquare, 
  FileText,
  Globe,
  Clock,
  TrendingUp,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAdminAnalytics } from '@/hooks/useAdminAnalytics';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { AdminOnlineUsersMap } from './AdminOnlineUsersMap';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--muted))'];

const DAY_NAMES = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

const PAGE_NAMES: Record<string, string> = {
  '/home': 'Bosh sahifa',
  '/messages': 'Xabarlar',
  '/profile': 'Profil',
  '/videos': 'Videolar',
  '/discovery': 'Kashfiyot',
  '/search': 'Qidiruv',
  '/marketplace': 'Do\'kon',
  '/map': 'Xarita',
  '/create': 'Yaratish',
  '/notifications': 'Bildirishnomalar',
  '/settings': 'Sozlamalar',
  '/activity': 'Faollik',
};

export function AdminAnalyticsDashboard() {
  const {
    platformStats,
    hourlyActivity,
    pageStats,
    countryStats,
    ageStats,
    dauTrend,
    weeklyPattern,
    isLoading,
    refetch
  } = useAdminAnalytics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const stats = platformStats || {
    total_users: 0,
    online_users: 0,
    new_users_24h: 0,
    new_users_7d: 0,
    new_users_30d: 0,
    verified_users: 0,
    total_posts: 0,
    posts_24h: 0,
    total_messages: 0,
    messages_24h: 0
  };

  const hourlyData = hourlyActivity.map(h => ({
    hour: `${h.hour}:00`,
    faollik: h.activity_count,
    davomiylik: Math.round((h.total_duration || 0) / 60)
  }));

  const weeklyData = weeklyPattern.map(w => ({
    day: DAY_NAMES[w.day_of_week] || `Day ${w.day_of_week}`,
    faollik: w.activity_count,
    users: w.unique_users
  }));

  const pageData = pageStats.slice(0, 10).map(p => ({
    page: PAGE_NAMES[p.page] || p.page,
    tashriflar: p.visit_count,
    users: p.unique_users,
    davomiylik: Math.round((p.avg_duration || 0) / 60)
  }));

  const countryData = countryStats.slice(0, 8);
  const totalCountryUsers = countryData.reduce((sum, c) => sum + c.user_count, 0);

  const ageData = ageStats.filter(a => a.age_group !== 'Unknown');
  const totalAgeUsers = ageStats.reduce((sum, a) => sum + a.user_count, 0);

  const dauData = dauTrend.map(d => ({
    date: new Date(d.date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' }),
    dau: d.dau
  }));

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Platform Analitikasi</h2>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yangilash
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total_users.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Jami foydalanuvchilar</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.online_users.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Hozir onlayn</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.new_users_24h.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">24 soatda yangi</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.verified_users.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Tasdiqlangan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-semibold">{stats.total_posts.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Jami postlar</p>
            <p className="text-xs text-green-500">+{stats.posts_24h} bugun</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-semibold">{stats.total_messages.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Jami xabarlar</p>
            <p className="text-xs text-green-500">+{stats.messages_24h} bugun</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-semibold">{stats.new_users_7d.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">7 kunlik yangi</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-semibold">{stats.new_users_30d.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">30 kunlik yangi</p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Online Users Map */}
      <AdminOnlineUsersMap />

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DAU Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Kunlik faol foydalanuvchilar (30 kun)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dauData.length > 0 ? (
              <ChartContainer config={{ dau: { label: 'DAU', color: 'hsl(var(--primary))' } }} className="h-[200px] w-full">
                <AreaChart data={dauData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area 
                    type="monotone" 
                    dataKey="dau" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Ma'lumot yo'q
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Soatlik faollik (7 kun)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hourlyData.length > 0 ? (
              <ChartContainer config={{ faollik: { label: 'Faollik', color: 'hsl(var(--chart-2))' } }} className="h-[200px] w-full">
                <BarChart data={hourlyData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="faollik" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Ma'lumot yo'q
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Pattern */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Haftalik faollik namunasi</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.length > 0 ? (
              <ChartContainer config={{ faollik: { label: 'Faollik', color: 'hsl(var(--chart-3))' } }} className="h-[200px] w-full">
                <BarChart data={weeklyData}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="faollik" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Ma'lumot yo'q
              </div>
            )}
          </CardContent>
        </Card>

        {/* Page Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Eng ko'p foydalanilgan sahifalar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[200px] overflow-y-auto">
              {pageData.length > 0 ? pageData.map((page, index) => (
                <div key={page.page} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{page.page}</span>
                    <span className="text-muted-foreground">{page.tashriflar.toLocaleString()} tashrif</span>
                  </div>
                  <Progress 
                    value={(page.tashriflar / (pageData[0]?.tashriflar || 1)) * 100} 
                    className="h-2"
                  />
                </div>
              )) : (
                <div className="text-center text-muted-foreground py-8">
                  Ma'lumot yo'q
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Demographics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Country Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Davlatlar bo'yicha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {countryData.length > 0 ? (
                <>
                  <div className="w-32 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={countryData}
                          dataKey="user_count"
                          nameKey="country"
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                        >
                          {countryData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2 max-h-32 overflow-y-auto">
                    {countryData.map((c, index) => (
                      <div key={c.country} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="truncate">{c.country}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {c.user_count} ({Math.round((c.user_count / totalCountryUsers) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 text-center text-muted-foreground py-8">
                  Ma'lumot yo'q
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Age Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Yosh bo'yicha taqsimot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {ageData.length > 0 ? (
                <>
                  <div className="w-32 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ageData}
                          dataKey="user_count"
                          nameKey="age_group"
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                        >
                          {ageData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {ageData.map((a, index) => (
                      <div key={a.age_group} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span>{a.age_group} yosh</span>
                        </div>
                        <span className="text-muted-foreground">
                          {a.user_count} ({Math.round((a.user_count / totalAgeUsers) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 text-center text-muted-foreground py-8">
                  Ma'lumot yo'q
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
