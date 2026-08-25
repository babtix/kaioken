package daemon

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestHandleUsageLedger(t *testing.T) {
	ts := newTestServer(t, nil)

	for _, tc := range []struct {
		query   string
		wantDay any
	}{
		{"", float64(30)},
		{"?days=7", float64(7)},
		{"?days=30", float64(30)},
		{"?days=90", float64(90)},
		{"?days=all", "all"},
	} {
		resp := doRequest(t, "GET", ts.URL+"/v1/usage"+tc.query, testToken, "")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("query %q: got status %d, want %d", tc.query, resp.StatusCode, http.StatusOK)
		}
		var payload struct {
			Days    any `json:"days"`
			Summary struct {
				Calls int `json:"calls"`
			} `json:"summary"`
			PricingStale bool `json:"pricing_stale"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatalf("query %q: decode error: %v", tc.query, err)
		}
		if payload.Days != tc.wantDay {
			t.Errorf("query %q: got days %v, want %v", tc.query, payload.Days, tc.wantDay)
		}
	}
}
