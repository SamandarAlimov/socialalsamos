import { useState } from 'react';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';
import { 
  Clock, 
  Calendar, 
  TrendingUp, 
  BarChart3, 
  Activity,
  Smartphone,
  Sun,
  Moon,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useActivityTracking, ActivitySummary } from '@/hooks/useActivityTracking';
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
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

// Format minutes to readable time
const formatTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)} daqiqa`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours} soat`;
  }
  return `${hours} soat ${mins} daqiqa`;
};

// Short format for charts
const formatShortTime = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)}d`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}s ${mins}d` : `${hours}s`;
};

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
}

function StatCard({ title, value, subtitle, icon, trend }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
        </div>
        {trend !== undefined && (
          <div className={`mt-2 flex items-center gap-1 text-xs ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            <TrendingUp className={`h-3 w-3 ${trend < 0 ? 'rotate-180' : ''}`} />
            <span>{Math.abs(trend)}% o'tgan haftaga nisbatan</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface HourlyChartProps {
  data: number[];
}

function HourlyChart({ data }: HourlyChartProps) {
  const chartData = data.map((minutes, hour) => ({
    hour: `${hour.toString().padStart(2, '0')}:00`,
    minutes,
    label: hour < 6 ? 'Tun' : hour < 12 ? 'Ertalab' : hour < 18 ? 'Kunduzi' : 'Kechqurun',
  }));

  const chartConfig = {
    minutes: {
      label: 'Vaqt',
      color: 'hsl(var(--primary))',
    },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <BarChart data={chartData}>
        <XAxis 
          dataKey="hour" 
          tick={{ fontSize: 10 }} 
          tickLine={false}
          axisLine={false}
          interval={3}
        />
        <YAxis 
          tick={{ fontSize: 10 }} 
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatShortTime(value)}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div className="bg-background border rounded-lg p-2 shadow-lg">
                  <p className="font-medium">{data.hour}</p>
                  <p className="text-sm text-muted-foreground">{formatTime(data.minutes)}</p>
                </div>
              );
            }
            return null;
          }}
        />
        <Bar 
          dataKey="minutes" 
          fill="hsl(var(--primary))" 
          radius={[4, 4, 0, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ChartContainer>
  );
}

interface WeeklyChartProps {
  data: { day: string; minutes: number }[];
}

function WeeklyChart({ data }: WeeklyChartProps) {
  const maxMinutes = Math.max(...data.map(d => d.minutes));

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10">{item.day}</span>
          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
              style={{ width: `${maxMinutes > 0 ? (item.minutes / maxMinutes) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-16 text-right">
            {formatShortTime(item.minutes)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface DailyListProps {
  data: { date: string; totalMinutes: number; sessions: number; pages: { [key: string]: number } }[];
}

function DailyList({ data }: DailyListProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const getCategoryLabel = (page: string): string => {
    const labels: { [key: string]: string } = {
      '/home': 'Bosh sahifa',
      '/messages': 'Xabarlar',
      '/videos': 'Videolar',
      '/discover': 'Kashfiyot',
      '/profile': 'Profil',
      '/marketplace': "Do'kon",
      '/map': 'Xarita',
      '/settings': 'Sozlamalar',
      '/ai': 'AI',
      '/create': 'Yaratish',
    };
    
    for (const [key, label] of Object.entries(labels)) {
      if (page.includes(key)) return label;
    }
    return 'Boshqa';
  };

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-2 pr-4">
        {data.map((day) => (
          <div key={day.date} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)}
              className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {format(new Date(day.date), 'd MMMM', { locale: uz })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-primary font-medium">
                  {formatTime(day.totalMinutes)}
                </span>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedDate === day.date ? 'rotate-90' : ''}`} />
              </div>
            </button>
            
            {expandedDate === day.date && (
              <div className="p-3 pt-0 border-t bg-muted/30">
                <div className="space-y-2 mt-2">
                  {Object.entries(day.pages)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([page, minutes]) => (
                      <div key={page} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{getCategoryLabel(page)}</span>
                        <span>{formatShortTime(minutes)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

interface ActivityGoalProps {
  current: number;
  goal: number;
}

function ActivityGoal({ current, goal }: ActivityGoalProps) {
  const percentage = Math.min((current / goal) * 100, 100);
  const remaining = Math.max(goal - current, 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium">Kunlik limit</p>
            <p className="text-xs text-muted-foreground">
              {formatTime(current)} / {formatTime(goal)}
            </p>
          </div>
          <div className={`text-lg font-bold ${percentage >= 100 ? 'text-orange-500' : 'text-primary'}`}>
            {Math.round(percentage)}%
          </div>
        </div>
        <Progress value={percentage} className="h-2" />
        {remaining > 0 ? (
          <p className="text-xs text-muted-foreground mt-2">
            Limitgacha {formatTime(remaining)} qoldi
          </p>
        ) : (
          <p className="text-xs text-destructive mt-2">
            ⚠️ Kunlik limitga yetdingiz
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityDashboard() {
  const { activitySummary, isLoading, refreshSummary } = useActivityTracking();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!activitySummary) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Faollik ma'lumotlari topilmadi</p>
      </div>
    );
  }

  const dailyGoal = 120; // 2 hours default

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Faollik</h2>
          <p className="text-sm text-muted-foreground">
            Platformada sarflagan vaqtingiz
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshSummary}>
          <Activity className="h-4 w-4 mr-2" />
          Yangilash
        </Button>
      </div>

      {/* Today's Goal */}
      <ActivityGoal current={activitySummary.today} goal={dailyGoal} />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="Bugun"
          value={formatTime(activitySummary.today)}
          icon={<Clock className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Bu hafta"
          value={formatTime(activitySummary.thisWeek)}
          icon={<Calendar className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Bu oy"
          value={formatTime(activitySummary.thisMonth)}
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="O'rtacha kunlik"
          value={formatTime(activitySummary.averageDaily)}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        />
      </div>

      {/* Tabs for detailed view */}
      <Tabs defaultValue="hourly" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="hourly">Soatlik</TabsTrigger>
          <TabsTrigger value="weekly">Haftalik</TabsTrigger>
          <TabsTrigger value="daily">Kunlik</TabsTrigger>
        </TabsList>

        <TabsContent value="hourly" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Soatlik faollik
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HourlyChart data={activitySummary.hourlyDistribution} />
              <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  <span>00:00 - 06:00</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  <span>06:00 - 18:00</span>
                </div>
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  <span>18:00 - 00:00</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Eye className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Eng faol vaqt</p>
                  <p className="text-lg font-bold text-primary">
                    {activitySummary.mostActiveHour.toString().padStart(2, '0')}:00 - {(activitySummary.mostActiveHour + 1).toString().padStart(2, '0')}:00
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Hafta kunlari bo'yicha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyChart data={activitySummary.weeklyPattern} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Eng faol kun</p>
                  <p className="text-lg font-bold text-primary">
                    {activitySummary.mostActiveDay}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Kunlik tarix (oxirgi 30 kun)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DailyList data={activitySummary.dailyData} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Total Stats */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">
                {activitySummary.totalSessions}
              </p>
              <p className="text-xs text-muted-foreground">Jami sessiyalar</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {formatShortTime(activitySummary.thisYear)}
              </p>
              <p className="text-xs text-muted-foreground">Bu yil jami</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
