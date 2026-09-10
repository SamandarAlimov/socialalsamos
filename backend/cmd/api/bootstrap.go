package main

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/platform/config"
	platformhttp "github.com/SamandarAlimov/socialalsamos/backend/internal/platform/http"
)

const serviceName = "alsamos-api"

func newHTTPServer(cfg config.Config, logger *slog.Logger) *http.Server {
	handler := platformhttp.NewRouter(platformhttp.RouterConfig{
		Service: serviceName,
		Version: "foundation-v1",
		Logger:  logger,
		Ready: platformhttp.ReadyFunc(func(context.Context) error {
			// Database/provider readiness is added when those adapters are wired.
			// Until then, this process has no external dependency to probe.
			return nil
		}),
	})
	return &http.Server{
		Addr:              cfg.HTTPAddress,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}
}
