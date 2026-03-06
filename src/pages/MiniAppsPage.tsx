import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Star, Plus, Globe, X,
  Sparkles, Trash2, Edit2, Loader2, AppWindow, RotateCcw, ExternalLink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface MiniApp {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  url: string;
  icon_url: string | null;
  category: string;
  is_approved: boolean;
  users_count: number;
  rating: number;
  created_at: string;
  profiles?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

const categories = [
  { id: "all", label: "Barchasi", icon: Sparkles },
  { id: "tools", label: "Asboblar" },
  { id: "social", label: "Ijtimoiy" },
  { id: "education", label: "Ta'lim" },
  { id: "lifestyle", label: "Turmush tarzi" },
  { id: "entertainment", label: "Ko'ngil ochar" },
  { id: "news", label: "Yangiliklar" },
  { id: "other", label: "Boshqa" },
];

// Known platforms that have embed URLs or can be iframed directly
function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');

    // YouTube
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const videoId = u.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/shorts/')[1]?.split(/[?#]/)[0];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      // Channel/homepage - use full embed
      return `https://www.youtube.com/embed?listType=search&list=`;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split(/[?#]/)[0];
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=0`;
    }

    // Instagram - use embed
    if (host === 'instagram.com' || host === 'm.instagram.com') {
      if (/^\/(p|reel|tv)\//.test(u.pathname)) {
        return `https://www.instagram.com${u.pathname}embed/`;
      }
    }

    // Twitter/X - no reliable embed for full site
    // Facebook - no reliable embed for full site
    // LinkedIn - no reliable embed

    // Telegram - web version works in iframe for channels
    if (host === 't.me' || host === 'telegram.me') {
      const path = u.pathname.replace(/^\//, '');
      if (path && !path.includes('/')) {
        return `https://t.me/s/${path}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// No platforms are forced external - all open in internal browser
function shouldOpenExternal(_url: string): boolean {
  return false;
}

type LoadMode = 'direct' | 'proxy' | 'embed';

function getApiBase(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim();
  const raw = supabaseUrl || (projectId ? `https://${projectId}.supabase.co` : "");
  return raw.replace(/^http:\/\//, "https://");
}

export default function MiniAppsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedApp, setSelectedApp] = useState<MiniApp | null>(null);
  const [openedApp, setOpenedApp] = useState<MiniApp | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", url: "", icon_url: "", category: "other" });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingApp, setEditingApp] = useState<MiniApp | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", url: "", icon_url: "", category: "other" });
  const [editIconFile, setEditIconFile] = useState<File | null>(null);
  const [editIconPreview, setEditIconPreview] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [iframeSrc, setIframeSrc] = useState("");
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const [loadMode, setLoadMode] = useState<LoadMode>('direct');
  const [normalizedAppUrl, setNormalizedAppUrl] = useState("");

  const fetchApps = async () => {
    const { data, error } = await supabase
      .from("mini_apps")
      .select("*, profiles(username, display_name, avatar_url, is_verified)")
      .order("created_at", { ascending: false });

    if (!error && data) setApps(data as MiniApp[]);
    setLoading(false);
  };

  useEffect(() => { fetchApps(); }, []);

  // Reset iframe state when app changes
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
    setIframeReloadKey(0);
    setLoadMode('direct');
  }, [openedApp?.id]);

  // Determine iframe src based on app and load mode
  useEffect(() => {
    if (!openedApp) {
      setIframeSrc("");
      setNormalizedAppUrl("");
      return;
    }

    const url = openedApp.url.startsWith("http://") || openedApp.url.startsWith("https://")
      ? openedApp.url : `https://${openedApp.url}`;
    setNormalizedAppUrl(url);

    // 1. Check for embed URL first
    const embedUrl = getEmbedUrl(url);
    if (embedUrl && loadMode === 'direct') {
      setLoadMode('embed');
      setIframeSrc(embedUrl);
      return;
    }
    if (loadMode === 'embed' && embedUrl) {
      setIframeSrc(embedUrl);
      return;
    }

    // 2. Direct iframe (for sites that allow it)
    if (loadMode === 'direct') {
      setIframeSrc(url);
      return;
    }

    // 3. Proxy mode
    if (loadMode === 'proxy') {
      const apiBase = getApiBase();
      if (!apiBase) {
        setIframeError(true);
        return;
      }
      setIframeSrc(`${apiBase}/functions/v1/mini-app-proxy?url=${encodeURIComponent(url)}&_ts=${Date.now()}-${iframeReloadKey}`);
      return;
    }
  }, [openedApp, loadMode, iframeReloadKey]);

  // Timeout: if direct/embed doesn't load in 8s, try proxy. If proxy doesn't load in 12s, show error.
  useEffect(() => {
    if (!openedApp || iframeLoaded || iframeError) return;

    const timeoutMs = loadMode === 'proxy' ? 15000 : 8000;
    const timeout = window.setTimeout(() => {
      if (loadMode === 'direct' || loadMode === 'embed') {
        // Fallback to proxy
        setLoadMode('proxy');
        setIframeLoaded(false);
        setIframeError(false);
      } else {
        setIframeError(true);
      }
    }, timeoutMs);

    return () => window.clearTimeout(timeout);
  }, [openedApp, iframeLoaded, iframeError, loadMode]);

  const handleOpenInBrowser = useCallback(() => {
    if (normalizedAppUrl) {
      window.open(normalizedAppUrl, '_blank', 'noopener,noreferrer');
    }
  }, [normalizedAppUrl]);

  const handleCreate = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.url.trim()) {
      toast({ title: "Xato", description: "Nom va URL majburiy", variant: "destructive" });
      return;
    }

    try {
      const testUrl = form.url.startsWith('http') ? form.url : `https://${form.url}`;
      new URL(testUrl);
    } catch {
      toast({ title: "Xato", description: "URL noto'g'ri formatda", variant: "destructive" });
      return;
    }

    setCreating(true);

    let finalIconUrl = form.icon_url.trim() || null;

    if (iconFile) {
      setUploadingIcon(true);
      const fileExt = iconFile.name.split('.').pop();
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('mini-app-icons')
        .upload(filePath, iconFile);

      if (uploadError) {
        toast({ title: "Xato", description: "Rasm yuklashda xatolik: " + uploadError.message, variant: "destructive" });
        setCreating(false);
        setUploadingIcon(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from('mini-app-icons')
        .getPublicUrl(filePath);
      finalIconUrl = publicData.publicUrl;
      setUploadingIcon(false);
    }

    const { error } = await supabase.from("mini_apps").insert({
      user_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      url: form.url.trim(),
      icon_url: finalIconUrl,
      category: form.category,
    });

    if (error) {
      toast({ title: "Xato", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Muvaffaqiyatli", description: "Mini app yaratildi!" });
      setShowCreate(false);
      setForm({ name: "", description: "", url: "", icon_url: "", category: "other" });
      setIconFile(null);
      setIconPreview(null);
      fetchApps();
    }
    setCreating(false);
  };

  const handleDelete = async (appId: string) => {
    const { error } = await supabase.from("mini_apps").delete().eq("id", appId);
    if (!error) {
      toast({ title: "O'chirildi" });
      setSelectedApp(null);
      fetchApps();
    }
  };

  const openEditDialog = (app: MiniApp) => {
    setEditingApp(app);
    setEditForm({
      name: app.name,
      description: app.description || "",
      url: app.url,
      icon_url: app.icon_url || "",
      category: app.category,
    });
    setEditIconFile(null);
    setEditIconPreview(app.icon_url || null);
    setSelectedApp(null);
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!user || !editingApp) return;
    if (!editForm.name.trim() || !editForm.url.trim()) {
      toast({ title: "Xato", description: "Nom va URL majburiy", variant: "destructive" });
      return;
    }

    try { 
      const testUrl = editForm.url.startsWith('http') ? editForm.url : `https://${editForm.url}`;
      new URL(testUrl);
    } catch {
      toast({ title: "Xato", description: "URL noto'g'ri formatda", variant: "destructive" });
      return;
    }

    setUpdating(true);
    let finalIconUrl = editForm.icon_url.trim() || null;

    if (editIconFile) {
      const fileExt = editIconFile.name.split('.').pop();
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('mini-app-icons')
        .upload(filePath, editIconFile);

      if (uploadError) {
        toast({ title: "Xato", description: "Rasm yuklashda xatolik: " + uploadError.message, variant: "destructive" });
        setUpdating(false);
        return;
      }

      const { data: publicData } = supabase.storage.from('mini-app-icons').getPublicUrl(filePath);
      finalIconUrl = publicData.publicUrl;
    }

    const { error } = await supabase.from("mini_apps").update({
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      url: editForm.url.trim(),
      icon_url: finalIconUrl,
      category: editForm.category,
    }).eq("id", editingApp.id);

    if (error) {
      toast({ title: "Xato", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Muvaffaqiyatli", description: "Mini app yangilandi!" });
      setShowEdit(false);
      setEditingApp(null);
      fetchApps();
    }
    setUpdating(false);
  };

  const filtered = apps.filter(a => {
    if (activeCategory !== "all" && a.category !== activeCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleOpenApp = (app: MiniApp) => {
    const normalizedUrl = app.url.startsWith("http://") || app.url.startsWith("https://")
      ? app.url : `https://${app.url}`;

    // If it's a platform that can only open externally, do that
    if (shouldOpenExternal(normalizedUrl)) {
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
      toast({ title: "Tashqi brauzerda ochildi", description: `${app.name} tashqi brauzerda ochildi` });
      return;
    }

    try {
      new URL(normalizedUrl);
      setOpenedApp({ ...app, url: normalizedUrl });
      setSelectedApp(null);
    } catch {
      toast({ title: "Xato", description: "Mini app URL noto'g'ri", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="h-[calc(100vh-7.5rem)] sm:h-[calc(100vh-4rem)] md:h-screen overflow-y-auto scrollbar-hidden">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-5 pb-24 md:pb-8">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-0.5 sm:mb-1">Mini Apps</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">O'z ilovangizni yarating yoki boshqalarnikini kashf qiling</p>
            </div>
            {user && (
              <Button onClick={() => setShowCreate(true)} className="rounded-xl gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Yaratish</span>
              </Button>
            )}
          </motion.div>

          {/* Search */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="relative mb-4 sm:mb-5">
            <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Mini app qidirish..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 sm:pl-10 h-10 sm:h-11 rounded-xl bg-card/50 backdrop-blur-sm border-border/50"
            />
            {search && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setSearch("")}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </motion.div>

          {/* Categories */}
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 sm:pb-3 mb-4 sm:mb-5 scrollbar-hidden -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6" style={{ WebkitOverflowScrolling: 'touch' }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap border transition-all flex-shrink-0",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                    : "bg-card/40 text-muted-foreground border-border/50 hover:bg-card/70 hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Apps Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
              <AppWindow className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {search ? "Hech narsa topilmadi" : "Hali mini app yo'q"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search ? "Boshqa kalit so'z bilan qidiring" : "Birinchi bo'lib o'z mini appingizni yarating!"}
              </p>
              {!search && user && (
                <Button onClick={() => setShowCreate(true)} variant="outline" className="rounded-xl gap-2">
                  <Plus className="h-4 w-4" /> Mini App yaratish
                </Button>
              )}
            </motion.div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
              {filtered.map((app, i) => (
                <motion.button
                  key={app.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedApp(app)}
                  className={cn(
                    "relative group flex flex-col items-center text-center p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl",
                    "border border-border/50 backdrop-blur-xl bg-card/40 hover:bg-card/70",
                    "transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                  )}
                >
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-2.5 bg-muted/50 overflow-hidden border border-border/30">
                    {app.icon_url ? (
                      <img src={app.icon_url} alt={app.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <Globe className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
                    )}
                  </div>

                  <h3 className="text-[11px] sm:text-xs md:text-sm font-semibold text-foreground leading-tight line-clamp-1 w-full">{app.name}</h3>

                  <div className="flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1">
                    <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                    <span>{app.rating}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* App Detail / Info Sheet */}
      <AnimatePresence>
      {selectedApp && !openedApp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          >
            <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedApp(null)} />
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 250 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) setSelectedApp(null);
              }}
              className="relative z-10 w-full md:max-w-lg bg-background/95 backdrop-blur-2xl rounded-t-3xl md:rounded-3xl border border-border/50 shadow-2xl max-h-[92vh] overflow-auto pb-20 md:pb-0"
            >
              <div className="flex justify-center pt-3 md:hidden">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="p-5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-muted/50 overflow-hidden border border-border/30 flex-shrink-0">
                    {selectedApp.icon_url ? (
                      <img src={selectedApp.icon_url} alt={selectedApp.name} className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <Globe className="h-8 w-8 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-foreground">{selectedApp.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{selectedApp.description || "Tavsif mavjud emas"}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedApp(null)} className="h-8 w-8 rounded-full flex-shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {selectedApp.profiles && (
                  <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={selectedApp.profiles.avatar_url || ""} />
                      <AvatarFallback className="text-xs">{selectedApp.profiles.display_name?.[0] || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{selectedApp.profiles.display_name}</p>
                      <p className="text-xs text-muted-foreground">@{selectedApp.profiles.username}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{categories.find(c => c.id === selectedApp.category)?.label || selectedApp.category}</Badge>
                  </div>
                )}

                <div className="flex items-center gap-6 mb-5 py-3 border-y border-border/50">
                  <div className="text-center">
                    <div className="flex items-center gap-1 justify-center">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      <span className="text-lg font-bold text-foreground">{selectedApp.rating}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Reyting</span>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  <div className="text-center">
                    <span className="text-lg font-bold text-foreground">{selectedApp.users_count}</span>
                    <span className="text-[11px] text-muted-foreground block">Foydalanuvchilar</span>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  <div className="text-center">
                    <span className="text-lg font-bold text-foreground">Bepul</span>
                    <span className="text-[11px] text-muted-foreground block">Narxi</span>
                  </div>
                </div>

                <Button
                  className="w-full h-12 rounded-2xl text-base font-semibold gap-2"
                  onClick={() => handleOpenApp(selectedApp)}
                >
                  {shouldOpenExternal(selectedApp.url) ? (
                    <>
                      <ExternalLink className="h-5 w-5" />
                      Brauzerda ochish
                    </>
                  ) : (
                    <>
                      <AppWindow className="h-5 w-5" />
                      Ochish
                    </>
                  )}
                </Button>

                {user && selectedApp.user_id === user.id && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-2xl gap-2"
                      onClick={() => openEditDialog(selectedApp)}
                    >
                      <Edit2 className="h-4 w-4" />
                      Tahrirlash
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 rounded-2xl gap-2"
                      onClick={() => handleDelete(selectedApp.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      O'chirish
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen In-App Browser */}
      <AnimatePresence>
        {openedApp && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 250 }}
            className="fixed inset-0 z-[9999] bg-background flex flex-col"
          >
            {/* Browser Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-card/80 backdrop-blur-xl flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setOpenedApp(null)}>
                <X className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden flex-shrink-0">
                  {openedApp.icon_url ? (
                    <img src={openedApp.icon_url} alt="" className="w-5 h-5 rounded object-cover" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <span className="text-sm font-medium text-foreground truncate">{openedApp.name}</span>
                {loadMode === 'proxy' && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">proksi</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => {
                  setIframeError(false);
                  setIframeLoaded(false);
                  setIframeReloadKey(prev => prev + 1);
                }}
                title="Qayta yuklash"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={handleOpenInBrowser}
                title="Brauzerda ochish"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 relative">
              {!iframeLoaded && !iframeError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {loadMode === 'proxy' ? 'Proksi orqali yuklanmoqda...' : 'Yuklanmoqda...'}
                    </span>
                  </div>
                </div>
              )}
              {iframeError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                  <div className="flex flex-col items-center gap-3 text-center px-6">
                    <Globe className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-base font-medium text-foreground">Yuklanmadi</p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Bu sayt ichki ko'rinishda yuklanishi mumkin emas. Brauzerda ochib ko'ring.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        className="rounded-xl gap-2"
                        onClick={() => {
                          setIframeError(false);
                          setIframeLoaded(false);
                          if (loadMode !== 'proxy') {
                            setLoadMode('proxy');
                          } else {
                            setIframeReloadKey(prev => prev + 1);
                          }
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Qayta urinish
                      </Button>
                      <Button
                        className="rounded-xl gap-2"
                        onClick={handleOpenInBrowser}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Brauzerda ochish
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {iframeSrc && (
                <iframe
                  key={`${openedApp.id}-${loadMode}-${iframeReloadKey}`}
                  src={iframeSrc}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals allow-downloads allow-presentation"
                  allow="accelerometer; autoplay; camera; clipboard-read; clipboard-write; encrypted-media; geolocation; gyroscope; microphone; picture-in-picture; web-share; fullscreen"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={openedApp.name}
                  onLoad={() => {
                    setIframeLoaded(true);
                    setIframeError(false);
                  }}
                  onError={() => {
                    if (loadMode === 'direct' || loadMode === 'embed') {
                      setLoadMode('proxy');
                    } else {
                      setIframeError(true);
                    }
                  }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mini App yaratish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom *</Label>
              <Input placeholder="Masalan: Islom.uz" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>URL *</Label>
              <Input placeholder="https://example.com" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Tavsif</Label>
              <Textarea placeholder="Qisqa tavsif..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Ikonka (rasm yuklash)</Label>
              <div className="mt-1 space-y-2">
                {iconPreview ? (
                  <div className="flex items-center gap-3">
                    <img src={iconPreview} alt="Icon preview" className="w-14 h-14 rounded-xl object-cover border border-border/50" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setIconFile(null); setIconPreview(null); }}
                      className="rounded-xl"
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> O'chirish
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">PNG, JPG, SVG, ICO</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/x-icon,image/ico,image/webp"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setIconFile(file);
                          setIconPreview(URL.createObjectURL(file));
                          setForm(f => ({ ...f, icon_url: "" }));
                        }
                      }}
                    />
                  </label>
                )}
                {!iconFile && (
                  <Input
                    placeholder="Yoki URL kiriting: https://example.com/icon.png"
                    value={form.icon_url}
                    onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))}
                  />
                )}
              </div>
            </div>
            <div>
              <Label>Kategoriya</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.id !== "all").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full rounded-xl">
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Yaratish
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mini App tahrirlash</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom *</Label>
              <Input placeholder="Masalan: Islom.uz" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>URL *</Label>
              <Input placeholder="https://example.com" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Tavsif</Label>
              <Textarea placeholder="Qisqa tavsif..." value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Ikonka</Label>
              <div className="mt-1 space-y-2">
                {editIconPreview ? (
                  <div className="flex items-center gap-3">
                    <img src={editIconPreview} alt="Icon preview" className="w-14 h-14 rounded-xl object-cover border border-border/50" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setEditIconFile(null); setEditIconPreview(null); setEditForm(f => ({ ...f, icon_url: "" })); }}
                      className="rounded-xl"
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> O'chirish
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">PNG, JPG, SVG, ICO</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/x-icon,image/ico,image/webp"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditIconFile(file);
                          setEditIconPreview(URL.createObjectURL(file));
                          setEditForm(f => ({ ...f, icon_url: "" }));
                        }
                      }}
                    />
                  </label>
                )}
                {!editIconFile && !editIconPreview && (
                  <Input
                    placeholder="Yoki URL kiriting: https://example.com/icon.png"
                    value={editForm.icon_url}
                    onChange={e => setEditForm(f => ({ ...f, icon_url: e.target.value }))}
                  />
                )}
              </div>
            </div>
            <div>
              <Label>Kategoriya</Label>
              <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.id !== "all").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleUpdate} disabled={updating} className="w-full rounded-xl">
              {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Edit2 className="h-4 w-4 mr-2" />}
              Saqlash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
