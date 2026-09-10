package platformhttp

import (
	"fmt"
	"net/url"
	"strconv"
)

func ParseLimit(values url.Values, defaultLimit, maxLimit int) (int, error) {
	if defaultLimit <= 0 || maxLimit <= 0 || defaultLimit > maxLimit {
		return 0, fmt.Errorf("invalid pagination configuration")
	}
	value := values.Get("limit")
	if value == "" {
		return defaultLimit, nil
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 || limit > maxLimit {
		return 0, fmt.Errorf("limit must be between 1 and %d", maxLimit)
	}
	return limit, nil
}
