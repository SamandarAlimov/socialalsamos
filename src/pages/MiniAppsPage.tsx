import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Star, Plus, Globe, X,
  Sparkles, Trash2, Edit2, Loader2, AppWindow
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
  }, [openedApp]);

  const handleCreate = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.url.trim()) {
      toast({ title: "Xato", description: "Nom va URL majburiy", variant: "destructive" });
      return;
    }

    try {
      new URL(form.url);
    } catch {
      toast({ title: "Xato", description: "URL noto'g'ri formatda", variant: "destructive" });
      return;
    }

    setCreating(true);

    let finalIconUrl = form.icon_url.trim() || null;

    // Upload icon file if selected
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

    try { new URL(editForm.url); } catch {
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

  const getProxyUrl = (url: string) => {
    const apiBase = import.meta.env.VITE_SUPABASE_URL;
    return `${apiBase}/functions/v1/mini-app-proxy?url=${encodeURIComponent(url)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <ScrollArea className="h-[calc(100vh-4rem)] md:h-screen">
        <div className="max-w-4xl mx-auto px-4 py-5 pb-24 md:pb-8">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Mini Apps</h1>
              <p className="text-sm text-muted-foreground">O'z ilovangizni yarating yoki boshqalarnikini kashf qiling</p>
            </div>
            {user && (
              <Button onClick={() => setShowCreate(true)} className="rounded-xl gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Yaratish</span>
              </Button>
            )}
          </motion.div>

          {/* Search */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="relative mb-5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Mini app qidirish..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-card/50 backdrop-blur-sm border-border/50"
            />
            {search && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setSearch("")}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </motion.div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hidden -mx-1 px-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-all flex-shrink-0",
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
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
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
                    "relative group flex flex-col items-center text-center p-3 sm:p-4 rounded-2xl",
                    "border border-border/50 backdrop-blur-xl bg-card/40 hover:bg-card/70",
                    "transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                  )}
                >
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2.5 bg-muted/50 overflow-hidden border border-border/30">
                    {app.icon_url ? (
                      <img src={app.icon_url} alt={app.name} className="w-10 h-10 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <Globe className="h-7 w-7 text-primary" />
                    )}
                  </div>

                  <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-tight line-clamp-1">{app.name}</h3>

                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                    <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                    <span>{app.rating}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

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
                  onClick={() => {
                    setOpenedApp(selectedApp);
                    setSelectedApp(null);
                  }}
                >
                  <AppWindow className="h-5 w-5" />
                  Ochish
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
            <div className="flex items-center gap-3 px-3 py-2 border-b border-border/50 bg-card/80 backdrop-blur-xl flex-shrink-0">
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
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">{openedApp.url}</span>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative">
              {!iframeLoaded && !iframeError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Yuklanmoqda...</span>
                  </div>
                </div>
              )}
              {iframeError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background">
                  <div className="flex flex-col items-center gap-3 text-center px-6">
                    <Globe className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">Mini app ichki ko'rinishda yuklanmadi</p>
                  </div>
                </div>
              )}
              <iframe
                src={getProxyUrl(openedApp.url)}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone"
                title={openedApp.name}
                onLoad={() => setIframeLoaded(true)}
                onError={() => setIframeError(true)}
              />
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
