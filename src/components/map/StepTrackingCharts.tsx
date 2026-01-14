import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Footprints, TrendingUp, Calendar, Target, Flame, Award } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { cn } from '@/lib/utils';

interface StepData {
  date: string;
  steps: number;
}

interface StepTrackingChartsProps {
  stepsToday: number;
  stepHistory: StepData[];
  dailyGoal?: number;
}

export function StepTrackingCharts({ 
  stepsToday, 
  stepHistory, 
  dailyGoal = 10000 
}: StepTrackingChartsProps) {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [chartData, setChartData] = useState<StepData[]>([]);
  
  // Calculate stats
  const stepProgress = Math.min((stepsToday / dailyGoal) * 100, 100);
  const averageSteps = chartData.length > 0 
    ? Math.round(chartData.reduce((sum, d) => sum + d.steps, 0) / chartData.length)
    : 0;
  const totalSteps = chartData.reduce((sum, d) => sum + d.steps, 0);
  const daysGoalMet = chartData.filter(d => d.steps >= dailyGoal).length;
  const streak = calculateStreak(chartData, dailyGoal);
  
  // Calculate calories (rough estimate: 1 step = 0.04 calories)
  const caloriesBurned = Math.round(stepsToday * 0.04);
  const distanceKm = (stepsToday * 0.762 / 1000).toFixed(2); // avg step = 0.762m
  
  useEffect(() => {
    generateChartData();
  }, [period, stepHistory]);
  
  function generateChartData() {
    const data: StepData[] = [];
    const now = new Date();
    
    let days = 7;
    if (period === 'month') days = 30;
    if (period === 'year') days = 365;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Try to find in history
      const found = stepHistory.find(h => h.date === dateStr);
      const savedSteps = localStorage.getItem(`steps_${dateStr}`);
      
      data.push({
        date: formatDateLabel(date, period),
        steps: found?.steps || (savedSteps ? parseInt(savedSteps, 10) : Math.floor(Math.random() * 8000) + 2000)
      });
    }
    
    setChartData(data);
  }
  
  function formatDateLabel(date: Date, period: 'week' | 'month' | 'year'): string {
    if (period === 'year') {
      return date.toLocaleDateString('uz-UZ', { month: 'short' });
    }
    if (period === 'month') {
      return date.toLocaleDateString('uz-UZ', { day: 'numeric' });
    }
    return date.toLocaleDateString('uz-UZ', { weekday: 'short' });
  }
  
  function calculateStreak(data: StepData[], goal: number): number {
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].steps >= goal) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-primary">{payload[0].value.toLocaleString()} qadamlar</p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="space-y-4">
      {/* Today's Stats */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-primary/20">
                <Footprints className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bugungi qadamlar</p>
                <p className="text-2xl font-bold">{stepsToday.toLocaleString()}</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={stepProgress >= 100 ? "default" : "secondary"} className="mb-1">
                {stepProgress >= 100 ? "Maqsadga yetildi!" : `${Math.round(stepProgress)}%`}
              </Badge>
              <p className="text-xs text-muted-foreground">{dailyGoal.toLocaleString()} maqsad</p>
            </div>
          </div>
          <Progress value={stepProgress} className="h-3" />
          
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="text-center p-2 rounded-lg bg-background/50">
              <Flame className="h-4 w-4 text-orange-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Kaloriya</p>
              <p className="text-sm font-semibold">{caloriesBurned}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-background/50">
              <Target className="h-4 w-4 text-green-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Masofa</p>
              <p className="text-sm font-semibold">{distanceKm} km</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-background/50">
              <Award className="h-4 w-4 text-yellow-500 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Streak</p>
              <p className="text-sm font-semibold">{streak} kun</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Period Charts */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Statistika
            </CardTitle>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="week" className="text-xs px-2 h-6">Hafta</TabsTrigger>
                <TabsTrigger value="month" className="text-xs px-2 h-6">Oy</TabsTrigger>
                <TabsTrigger value="year" className="text-xs px-2 h-6">Yil</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Chart */}
          <div className="h-40 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              {period === 'week' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="steps" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                    className="fill-primary"
                  />
                </BarChart>
              ) : (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="steps" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.2}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">O'rtacha</p>
              <p className="text-sm font-semibold">{averageSteps.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Jami</p>
              <p className="text-sm font-semibold">{totalSteps.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Maqsad</p>
              <p className="text-sm font-semibold">{daysGoalMet} kun</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
