package platformhttp

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	h := NewRouter(RouterConfig{Service: "alsamos-api", Version: "test"})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if rr.Header().Get("X-Request-ID") == "" {
		t.Fatal("missing request id")
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store header")
	}
}

func TestReadyFailsClosed(t *testing.T) {
	h := NewRouter(RouterConfig{
		Service: "alsamos-api",
		Ready: ReadyFunc(func(context.Context) error {
			return errors.New("database unavailable")
		}),
	})
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
}

func TestRequestIDRejectsUnsafeValue(t *testing.T) {
	h := NewRouter(RouterConfig{Service: "alsamos-api"})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "bad id\nvalue")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if got := rr.Header().Get("X-Request-ID"); got == "" || got == "bad id\nvalue" {
		t.Fatalf("unexpected request id %q", got)
	}
}
