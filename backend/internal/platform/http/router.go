package platformhttp

import (
	"context"
	"log/slog"
	"net/http"
)

type ReadyChecker interface {
	Ready(context.Context) error
}

type ReadyFunc func(context.Context) error

func (f ReadyFunc) Ready(ctx context.Context) error { return f(ctx) }

type RouterConfig struct {
	Service string
	Version string
	Ready   ReadyChecker
	Logger  *slog.Logger
}

type statusResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version,omitempty"`
}

func NewRouter(cfg RouterConfig) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, statusResponse{Status: "ok", Service: cfg.Service, Version: cfg.Version})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if cfg.Ready != nil {
			if err := cfg.Ready.Ready(r.Context()); err != nil {
				writeError(w, r, http.StatusServiceUnavailable, "NOT_READY", "service is not ready")
				return
			}
		}
		writeJSON(w, http.StatusOK, statusResponse{Status: "ready", Service: cfg.Service, Version: cfg.Version})
	})

	return Chain(mux, RequestID, SecurityHeaders, LimitBody(DefaultMaxBodyBytes), Recoverer(cfg.Logger))
}
