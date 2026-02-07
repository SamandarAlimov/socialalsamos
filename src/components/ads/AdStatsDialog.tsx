import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdStats } from '@/hooks/useAds';
import { 
  Eye, 
  MousePointerClick, 
  Users, 
  TrendingUp,
  DollarSign,
  Loader2,
  BarChart3
} from 'lucide-react';

interface AdStatsDialogProps {
  adId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdStatsDialog({ adId, open, onOpenChange }: AdStatsDialogProps) {
  const { stats, dailyStats, isLoading } = useAdStats(adId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Reklama statistikasi
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Main Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      <span className="text-xs">Ko'rishlar</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">
                      {stats.impressions.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MousePointerClick className="h-4 w-4" />
                      <span className="text-xs">Kliklar</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">
                      {stats.clicks.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span className="text-xs">Reach</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">
                      {stats.reach.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs">CTR</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">
                      {stats.ctr.toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Spent */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm">Sarflangan</span>
                    </div>
                    <p className="text-xl font-bold">
                      ${stats.spent.toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Daily Chart */}
              <div>
                <h3 className="font-medium mb-3">Oxirgi 7 kun</h3>
                <div className="space-y-2">
                  {dailyStats.map(day => {
                    const maxImpressions = Math.max(...dailyStats.map(d => d.impressions), 1);
                    const width = (day.impressions / maxImpressions) * 100;
                    
                    return (
                      <div key={day.date} className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{day.date}</span>
                          <span>
                            {day.impressions} ko'rish, {day.clicks} klik
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
