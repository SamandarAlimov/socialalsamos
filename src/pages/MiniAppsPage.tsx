import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Star, TrendingUp, Gamepad2, Calculator, Users, 
  Music, Camera, Palette, BookOpen, Globe, ShoppingBag,
  Zap, Heart, Brain, Dices, Timer, Trophy, Gift, 
  MessageCircle, Cloud, Newspaper, Utensils, Plane,
  Sparkles, ChevronRight, X, ArrowLeft
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────
interface MiniApp {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category: string;
  color: string;
  gradient: string;
  users: string;
  rating: number;
  isFeatured?: boolean;
  isNew?: boolean;
  isTrending?: boolean;
}

// ── Data ───────────────────────────────────────────────
const categories = [
  { id: "all", label: "Barchasi", icon: Sparkles },
  { id: "popular", label: "Mashhur", icon: TrendingUp },
  { id: "games", label: "O'yinlar", icon: Gamepad2 },
  { id: "tools", label: "Asboblar", icon: Calculator },
  { id: "social", label: "Ijtimoiy", icon: Users },
  { id: "entertainment", label: "Ko'ngil ochar", icon: Music },
  { id: "education", label: "Ta'lim", icon: BookOpen },
  { id: "lifestyle", label: "Turmush tarzi", icon: Heart },
];

const miniApps: MiniApp[] = [
  { id: "1", name: "Viktorina", description: "Bilimingizni sinab ko'ring", icon: Brain, category: "games", color: "from-violet-500 to-purple-600", gradient: "bg-gradient-to-br from-violet-500/20 to-purple-600/20", users: "12.5K", rating: 4.8, isFeatured: true, isTrending: true },
  { id: "2", name: "Valyuta", description: "Valyuta kurslari va konvertor", icon: Globe, category: "tools", color: "from-emerald-500 to-teal-600", gradient: "bg-gradient-to-br from-emerald-500/20 to-teal-600/20", users: "8.2K", rating: 4.9, isFeatured: true },
  { id: "3", name: "Ob-havo", description: "Havo ob-havo ma'lumotlari", icon: Cloud, category: "tools", color: "from-sky-500 to-blue-600", gradient: "bg-gradient-to-br from-sky-500/20 to-blue-600/20", users: "15.1K", rating: 4.7, isFeatured: true, isTrending: true },
  { id: "4", name: "Zarlar", description: "Online zar o'yini", icon: Dices, category: "games", color: "from-red-500 to-rose-600", gradient: "bg-gradient-to-br from-red-500/20 to-rose-600/20", users: "6.7K", rating: 4.5 },
  { id: "5", name: "Taymer", description: "Professional taymer va sekundomer", icon: Timer, category: "tools", color: "from-orange-500 to-amber-600", gradient: "bg-gradient-to-br from-orange-500/20 to-amber-600/20", users: "9.3K", rating: 4.6 },
  { id: "6", name: "So'rovnoma", description: "Guruhda so'rovnoma yarating", icon: MessageCircle, category: "social", color: "from-pink-500 to-rose-600", gradient: "bg-gradient-to-br from-pink-500/20 to-rose-600/20", users: "5.1K", rating: 4.4, isNew: true },
  { id: "7", name: "Retseptlar", description: "Milliy taomlar retseptlari", icon: Utensils, category: "lifestyle", color: "from-yellow-500 to-orange-600", gradient: "bg-gradient-to-br from-yellow-500/20 to-orange-600/20", users: "11.2K", rating: 4.8, isTrending: true },
  { id: "8", name: "Musiqa pleyer", description: "Online musiqa tinglash", icon: Music, category: "entertainment", color: "from-fuchsia-500 to-pink-600", gradient: "bg-gradient-to-br from-fuchsia-500/20 to-pink-600/20", users: "20.5K", rating: 4.9, isFeatured: true },
  { id: "9", name: "Foto redaktor", description: "Rasmlarni tahrirlash", icon: Camera, category: "entertainment", color: "from-cyan-500 to-sky-600", gradient: "bg-gradient-to-br from-cyan-500/20 to-sky-600/20", users: "14.8K", rating: 4.7 },
  { id: "10", name: "Chizish", description: "Ijodiy rasm chizish", icon: Palette, category: "entertainment", color: "from-indigo-500 to-violet-600", gradient: "bg-gradient-to-br from-indigo-500/20 to-violet-600/20", users: "7.6K", rating: 4.5, isNew: true },
  { id: "11", name: "Turnir", description: "Online musobaqalar", icon: Trophy, category: "games", color: "from-amber-500 to-yellow-600", gradient: "bg-gradient-to-br from-amber-500/20 to-yellow-600/20", users: "4.2K", rating: 4.3 },
  { id: "12", name: "Yangiliklar", description: "So'nggi yangiliklar", icon: Newspaper, category: "lifestyle", color: "from-slate-500 to-gray-600", gradient: "bg-gradient-to-br from-slate-500/20 to-gray-600/20", users: "18.9K", rating: 4.6, isTrending: true },
  { id: "13", name: "Lug'at", description: "Ko'p tilli lug'at", icon: BookOpen, category: "education", color: "from-teal-500 to-emerald-600", gradient: "bg-gradient-to-br from-teal-500/20 to-emerald-600/20", users: "10.4K", rating: 4.8 },
  { id: "14", name: "Sayohat", description: "Sayohat rejalari va maslahatlar", icon: Plane, category: "lifestyle", color: "from-blue-500 to-indigo-600", gradient: "bg-gradient-to-br from-blue-500/20 to-indigo-600/20", users: "3.8K", rating: 4.4, isNew: true },
  { id: "15", name: "Sovg'a", description: "Virtual sovg'alar yuborish", icon: Gift, category: "social", color: "from-rose-500 to-red-600", gradient: "bg-gradient-to-br from-rose-500/20 to-red-600/20", users: "6.1K", rating: 4.5 },
  { id: "16", name: "Kalkulyator", description: "Ilmiy kalkulyator", icon: Calculator, category: "tools", color: "from-gray-500 to-slate-600", gradient: "bg-gradient-to-br from-gray-500/20 to-slate-600/20", users: "13.7K", rating: 4.7 },
  { id: "17", name: "Do'kon", description: "Mini do'kon va chegirmalar", icon: ShoppingBag, category: "social", color: "from-lime-500 to-green-600", gradient: "bg-gradient-to-br from-lime-500/20 to-green-600/20", users: "7.9K", rating: 4.3 },
  { id: "18", name: "Tezkor test", description: "Tezkor bilim testlari", icon: Zap, category: "education", color: "from-orange-500 to-red-600", gradient: "bg-gradient-to-br from-orange-500/20 to-red-600/20", users: "5.5K", rating: 4.6 },
];

// ── App Card ───────────────────────────────────────────
function AppCard({ app, index, onOpen }: { app: MiniApp; index: number; onOpen: (app: MiniApp) => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onOpen(app)}
      className={cn(
        "relative group flex flex-col items-center text-center p-4 rounded-2xl",
        "border border-border/50 backdrop-blur-xl",
        "bg-card/40 hover:bg-card/70",
        "transition-all duration-300",
        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
      )}
    >
      {/* Badges */}
      <div className="absolute top-2 right-2 flex gap-1">
        {app.isNew && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            Yangi
          </Badge>
        )}
        {app.isTrending && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
            <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
            Top
          </Badge>
        )}
      </div>

      {/* Icon */}
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center mb-3",
        "bg-gradient-to-br shadow-lg",
        app.color
      )}>
        <app.icon className="h-7 w-7 text-white" />
      </div>

      {/* Name */}
      <h3 className="text-sm font-semibold text-foreground leading-tight mb-1 line-clamp-1">
        {app.name}
      </h3>

      {/* Rating & Users */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
        <span>{app.rating}</span>
        <span className="text-border">•</span>
        <span>{app.users}</span>
      </div>
    </motion.button>
  );
}

// ── Featured Card ──────────────────────────────────────
function FeaturedCard({ app, onOpen }: { app: MiniApp; onOpen: (app: MiniApp) => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(app)}
      className={cn(
        "relative min-w-[220px] md:min-w-[260px] snap-center flex-shrink-0",
        "rounded-2xl overflow-hidden border border-border/50",
        "backdrop-blur-xl bg-card/40 hover:bg-card/70",
        "transition-all duration-300 hover:border-primary/40",
        "hover:shadow-xl hover:shadow-primary/10"
      )}
    >
      {/* Gradient header */}
      <div className={cn("h-24 bg-gradient-to-br flex items-center justify-center relative", app.color)}>
        <app.icon className="h-10 w-10 text-white/90" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="p-3 text-left">
        <h3 className="text-sm font-bold text-foreground mb-0.5">{app.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{app.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            <span>{app.rating}</span>
            <span className="text-border">•</span>
            <span>{app.users}</span>
          </div>
          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
            Ochish
          </Badge>
        </div>
      </div>
    </motion.button>
  );
}

// ── App Detail Overlay ─────────────────────────────────
function AppDetailOverlay({ app, onClose }: { app: MiniApp; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Content */}
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 250 }}
        className={cn(
          "relative z-10 w-full md:max-w-lg",
          "bg-background/95 backdrop-blur-2xl",
          "rounded-t-3xl md:rounded-3xl",
          "border border-border/50 shadow-2xl",
          "max-h-[85vh] overflow-auto"
        )}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 md:hidden">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className={cn("h-40 bg-gradient-to-br relative flex items-center justify-center", app.color)}>
          <app.icon className="h-16 w-16 text-white/90" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/30 hover:bg-black/50 text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Info */}
        <div className="p-5 -mt-8 relative">
          <div className="flex items-start gap-4 mb-4">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl bg-gradient-to-br flex-shrink-0", app.color)}>
              <app.icon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h2 className="text-xl font-bold text-foreground">{app.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{app.description}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 mb-5 py-3 border-y border-border/50">
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <span className="text-lg font-bold text-foreground">{app.rating}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Reyting</span>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <div className="text-center">
              <span className="text-lg font-bold text-foreground">{app.users}</span>
              <span className="text-[11px] text-muted-foreground block">Foydalanuvchilar</span>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <div className="text-center">
              <span className="text-lg font-bold text-foreground">Bepul</span>
              <span className="text-[11px] text-muted-foreground block">Narxi</span>
            </div>
          </div>

          {/* Launch button */}
          <Button
            className={cn(
              "w-full h-12 rounded-2xl text-base font-semibold",
              "bg-gradient-to-r shadow-lg",
              app.color,
              "text-white hover:opacity-90 transition-opacity"
            )}
          >
            <Zap className="h-5 w-5 mr-2" />
            Ishga tushirish
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-3">
            Bu mini app Alsamos platformasida ishlaydi
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────
export default function MiniAppsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedApp, setSelectedApp] = useState<MiniApp | null>(null);

  const featuredApps = useMemo(() => miniApps.filter(a => a.isFeatured), []);

  const filteredApps = useMemo(() => {
    let filtered = miniApps;

    if (activeCategory === "popular") {
      filtered = [...miniApps].sort((a, b) => b.rating - a.rating);
    } else if (activeCategory !== "all") {
      filtered = miniApps.filter(a => a.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [activeCategory, search]);

  return (
    <div className="min-h-screen bg-background">
      <ScrollArea className="h-[calc(100vh-4rem)] md:h-screen">
        <div className="max-w-4xl mx-auto px-4 py-5 pb-24 md:pb-8">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
              Mini Apps
            </h1>
            <p className="text-sm text-muted-foreground">
              Eng yaxshi ilovalarni kashf qiling va ishga tushiring
            </p>
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="relative mb-5"
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Mini app qidirish..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={cn(
                "pl-10 h-11 rounded-xl",
                "bg-card/50 backdrop-blur-sm border-border/50",
                "focus:border-primary/50 focus:ring-primary/20"
              )}
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setSearch("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </motion.div>

          {/* Categories */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hidden -mx-1 px-1"
          >
            {categories.map(cat => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium",
                    "whitespace-nowrap transition-all duration-200 flex-shrink-0",
                    "border",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                      : "bg-card/40 text-muted-foreground border-border/50 hover:bg-card/70 hover:text-foreground"
                  )}
                >
                  <cat.icon className="h-3.5 w-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </motion.div>

          {/* Featured Section */}
          {!search && activeCategory === "all" && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-6"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                  Tavsiya etilgan
                </h2>
                <button className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                  Barchasi <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hidden -mx-1 px-1">
                {featuredApps.map(app => (
                  <FeaturedCard key={app.id} app={app} onOpen={setSelectedApp} />
                ))}
              </div>
            </motion.section>
          )}

          {/* Trending Section */}
          {!search && activeCategory === "all" && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-6"
            >
              <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                Trendda
              </h2>
              <div className="space-y-2">
                {miniApps.filter(a => a.isTrending).map((app, i) => (
                  <motion.button
                    key={app.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedApp(app)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl",
                      "bg-card/40 border border-border/50 backdrop-blur-sm",
                      "hover:bg-card/70 hover:border-primary/30 transition-all"
                    )}
                  >
                    <span className="text-lg font-bold text-muted-foreground/50 w-6 text-center">
                      {i + 1}
                    </span>
                    <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br flex-shrink-0", app.color)}>
                      <app.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{app.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-1">{app.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                      {app.rating}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </motion.button>
                ))}
              </div>
            </motion.section>
          )}

          {/* All Apps Grid */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <h2 className="text-base font-bold text-foreground mb-3">
              {activeCategory === "all" ? "Barcha ilovalar" :
               activeCategory === "popular" ? "Eng mashhurlar" :
               categories.find(c => c.id === activeCategory)?.label || "Ilovalar"}
            </h2>

            {filteredApps.length === 0 ? (
              <div className="text-center py-16">
                <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Hech narsa topilmadi</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {filteredApps.map((app, i) => (
                  <AppCard key={app.id} app={app} index={i} onOpen={setSelectedApp} />
                ))}
              </div>
            )}
          </motion.section>
        </div>
      </ScrollArea>

      {/* App Detail Overlay */}
      <AnimatePresence>
        {selectedApp && (
          <AppDetailOverlay app={selectedApp} onClose={() => setSelectedApp(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
