package platformhttp

import "net/http"

type CORSConfig struct {
	AllowedOrigins map[string]struct{}
}

func CORS(cfg CORSConfig) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if _, allowed := cfg.AllowedOrigins[origin]; allowed {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Vary", "Origin")
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
