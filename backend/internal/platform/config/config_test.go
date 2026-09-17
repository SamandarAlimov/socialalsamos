package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Environment != "development" {
		t.Fatalf("Environment = %q", cfg.Environment)
	}
	if cfg.HTTPAddress != ":8080" {
		t.Fatalf("HTTPAddress = %q", cfg.HTTPAddress)
	}
}

func TestLoadRejectsInvalidEnvironment(t *testing.T) {
	_, err := Load(func(key string) string {
		if key == "APP_ENV" {
			return "prod-ish"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected invalid environment error")
	}
}

func TestLoadRejectsInvalidAddress(t *testing.T) {
	_, err := Load(func(key string) string {
		if key == "HTTP_ADDR" {
			return "localhost"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected invalid address error")
	}
}
