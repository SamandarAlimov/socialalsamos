package config

import (
	"fmt"
	"net"
	"strconv"
	"strings"
)

var allowedEnvironments = map[string]struct{}{
	"development": {},
	"test":        {},
	"staging":     {},
	"production":  {},
}

func (c Config) Validate() error {
	if _, ok := allowedEnvironments[c.Environment]; !ok {
		return fmt.Errorf("unsupported APP_ENV %q", c.Environment)
	}
	if strings.TrimSpace(c.HTTPAddress) == "" {
		return fmt.Errorf("HTTP_ADDR is required")
	}

	_, port, err := net.SplitHostPort(c.HTTPAddress)
	if err != nil {
		return fmt.Errorf("invalid HTTP_ADDR %q: %w", c.HTTPAddress, err)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return fmt.Errorf("invalid HTTP_ADDR port %q", port)
	}
	if c.ShutdownTimeout <= 0 || c.ReadTimeout <= 0 || c.WriteTimeout <= 0 || c.IdleTimeout <= 0 {
		return fmt.Errorf("server timeouts must be positive")
	}
	return nil
}
