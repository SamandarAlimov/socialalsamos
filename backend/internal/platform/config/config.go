package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

const (
	defaultEnvironment     = "development"
	defaultHTTPAddress     = ":8080"
	defaultShutdownTimeout = 10 * time.Second
	defaultReadTimeout     = 5 * time.Second
	defaultWriteTimeout    = 15 * time.Second
	defaultIdleTimeout     = 60 * time.Second
)

type Config struct {
	Environment     string
	HTTPAddress     string
	ShutdownTimeout time.Duration
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	IdleTimeout     time.Duration
}

func FromEnv() (Config, error) {
	return Load(os.Getenv)
}

func Load(getenv func(string) string) (Config, error) {
	if getenv == nil {
		return Config{}, fmt.Errorf("getenv function is required")
	}

	cfg := Config{
		Environment:     valueOrDefault(getenv("APP_ENV"), defaultEnvironment),
		HTTPAddress:     valueOrDefault(getenv("HTTP_ADDR"), defaultHTTPAddress),
		ShutdownTimeout: defaultShutdownTimeout,
		ReadTimeout:     defaultReadTimeout,
		WriteTimeout:    defaultWriteTimeout,
		IdleTimeout:     defaultIdleTimeout,
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func valueOrDefault(value, fallback string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return trimmed
	}
	return fallback
}
