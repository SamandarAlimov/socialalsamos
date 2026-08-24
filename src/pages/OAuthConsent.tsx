import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlsamosLogo } from "@/components/AlsamosLogo";
import { Loader2 } from "lucide-react";

// Beta namespace — narrow typed wrapper to avoid depending on ambient types.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message || "Failed to load authorization");
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message || "Failed to load authorization");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setError(error.message || "Action failed");
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("No redirect returned by the authorization server.");
        return;
      }
      window.location.href = target;
    } catch (e: any) {
      setBusy(false);
      setError(e?.message || "Action failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="glass-strong rounded-3xl p-8 shadow-lg max-w-md w-full">
        <div className="flex flex-col items-center mb-6">
          <AlsamosLogo size="lg" className="mb-3" />
          <h1 className="text-xl font-semibold text-center">
            Ilovani hisobingizga ulash
          </h1>
        </div>

        {error && (
          <p className="text-sm text-destructive mb-4 text-center">{error}</p>
        )}

        {!details && !error && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {details && (
          <>
            <p className="text-sm text-muted-foreground text-center mb-6">
              <span className="font-medium text-foreground">
                {details.client?.name ?? details.client?.client_name ?? "Ilova"}
              </span>{" "}
              sizning nomingizdan Alsamos ma'lumotlariga kirmoqchi.
              Ruxsat berasizmi?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Rad etish
              </Button>
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => decide(true)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ruxsat berish"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
