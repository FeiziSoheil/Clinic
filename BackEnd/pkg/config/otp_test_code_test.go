package config

import "testing"

func TestResolveOTPTestCode(t *testing.T) {
	cases := []struct {
		name   string
		appEnv string
		code   string
		want   string
	}{
		{"dev with code", "development", "123456", "123456"},
		{"empty code", "development", "", ""},
		{"whitespace code", "development", "  ", ""},
		{"trim spaces", "development", " 123456 ", "123456"},
		{"production strips", "production", "123456", ""},
		{"Production case", "Production", "123456", ""},
		{"staging keeps", "staging", "999999", "999999"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveOTPTestCode(tc.appEnv, tc.code)
			if got != tc.want {
				t.Fatalf("ResolveOTPTestCode(%q, %q) = %q, want %q", tc.appEnv, tc.code, got, tc.want)
			}
		})
	}
}
