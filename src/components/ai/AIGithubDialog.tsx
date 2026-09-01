import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Github, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  connectGithub,
  disconnectGithub,
  githubStatus,
  listGithubRepos,
  GithubConnectorUnavailableError,
  type GithubRepo,
} from '@/lib/ai/githubConnector';

interface AIGithubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Repo tanlanganda chaqiriladi (masalan, kompozerga matn qo'shish uchun). */
  onPickRepo?: (repo: GithubRepo) => void;
}

export function AIGithubDialog({ open, onOpenChange, onPickRepo }: AIGithubDialogProps) {
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setServerError(null);
      try {
        const status = await githubStatus();
        if (cancelled) return;
        setConnected(status.connected);
        setLogin(status.login);
        if (status.connected) {
          const { repos: list } = await listGithubRepos();
          if (!cancelled) setRepos(list);
        }
      } catch (err) {
        if (!cancelled) {
          setConnected(false);
          setLogin(null);
          if (err instanceof GithubConnectorUnavailableError) setServerError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleConnect = async () => {
    const value = token.trim();
    if (!value) return;
    setLoading(true);
    setServerError(null);
    try {
      const res = await connectGithub(value);
      setConnected(true);
      setLogin(res.login);
      setToken('');
      const { repos: list } = await listGithubRepos();
      setRepos(list);
      toast({ title: 'GitHub ulandi', description: res.login ? `@${res.login}` : undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nomaʼlum xatolik';
      if (err instanceof GithubConnectorUnavailableError) setServerError(message);
      toast({ title: 'Ulanmadi', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectGithub();
      setConnected(false);
      setLogin(null);
      setRepos([]);
      toast({ title: 'GitHub uzildi' });
    } catch (err) {
      toast({
        title: 'Xatolik',
        description: err instanceof Error ? err.message : 'Nomaʼlum xatolik',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            GitHub
          </DialogTitle>
          <DialogDescription>
            Shaxsiy access token (PAT) bilan ulanadi. Token faqat serverda saqlanadi va hech qachon
            brauzerga qaytarilmaydi.
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
              <ShieldCheck className="h-4 w-4 text-alsamos-orange" />
              <span className="text-sm">
                Ulangan{login ? `: @${login}` : ''}
              </span>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={loading}>
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                Uzish
              </Button>
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {loading && repos.length === 0 && (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Repolar yuklanmoqda…
                </div>
              )}
              {repos.map((repo) => (
                <button
                  key={repo.fullName}
                  type="button"
                  onClick={() => {
                    onPickRepo?.(repo);
                    onOpenChange(false);
                  }}
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-muted/60"
                >
                  <span className="text-sm font-medium">{repo.fullName}</span>
                  {repo.description && (
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">
                      {repo.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // MUHIM: parol menejerlari bu maydonni "login formasi" deb o'ylamasligi uchun
          // form emas, oddiy div; inputda ham autofill butunlay o'chirilgan.
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="alsamos-github-pat">Access token</Label>
              <div className="relative">
                <Input
                  id="alsamos-github-pat"
                  name="alsamos-github-pat"
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder="github_pat_…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect();
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showToken ? 'Tokenni yashirish' : "Tokenni ko'rsatish"}
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                GitHub → Settings → Developer settings → Personal access tokens → Fine-grained.
                Ruxsatlar: Metadata (Read), Contents, Issues, Pull requests.
              </p>
            </div>
            <Button onClick={handleConnect} disabled={loading || !token.trim()} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Github className="mr-2 h-4 w-4" />}
              Ulash
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AIGithubDialog;
