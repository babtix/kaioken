package selfupdate

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The real Fulcio cannot be reached offline and its certificates expire in
// ten minutes, so these tests stand up a certificate authority with the same
// shape — self-signed root, intermediate, short-lived leaf carrying a URI SAN
// and the OIDC-issuer extension — and point the verifier at it.

type testCA struct {
	rootCert  *x509.Certificate
	interCert *x509.Certificate
	interKey  *ecdsa.PrivateKey
	anchors   trustAnchors
}

type leafOpts struct {
	sanURI    string
	issuer    string
	issuerOID asn1.ObjectIdentifier
	// selfSigned skips the CA entirely: the attacker's forged certificate,
	// claiming the right identity but chaining to nothing we trust.
	selfSigned bool
	notBefore  time.Time
}

func newTestCA(t *testing.T) *testCA {
	t.Helper()
	rootKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	rootTmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{Organization: []string{"test.dev"}, CommonName: "test-root"},
		NotBefore:             time.Now().Add(-10 * 365 * 24 * time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
	}
	rootDER, err := x509.CreateCertificate(rand.Reader, rootTmpl, rootTmpl, &rootKey.PublicKey, rootKey)
	if err != nil {
		t.Fatal(err)
	}
	rootCert, _ := x509.ParseCertificate(rootDER)

	interKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	interTmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(2),
		Subject:               pkix.Name{Organization: []string{"test.dev"}, CommonName: "test-intermediate"},
		NotBefore:             time.Now().Add(-10 * 365 * 24 * time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
	}
	interDER, err := x509.CreateCertificate(rand.Reader, interTmpl, rootCert, &interKey.PublicKey, rootKey)
	if err != nil {
		t.Fatal(err)
	}
	interCert, _ := x509.ParseCertificate(interDER)

	roots, inters := x509.NewCertPool(), x509.NewCertPool()
	roots.AddCert(rootCert)
	inters.AddCert(interCert)

	return &testCA{
		rootCert:  rootCert,
		interCert: interCert,
		interKey:  interKey,
		anchors:   trustAnchors{roots: roots, intermediates: inters},
	}
}

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func (c *testCA) issueLeaf(t *testing.T, o leafOpts) (certPEM []byte, key *ecdsa.PrivateKey) {
	t.Helper()
	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	notBefore := o.notBefore
	if notBefore.IsZero() {
		// Deliberately in the past and long expired, exactly like a Fulcio
		// certificate from any release older than ten minutes.
		notBefore = time.Now().Add(-90 * 24 * time.Hour)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject:      pkix.Name{CommonName: "signer"},
		NotBefore:    notBefore,
		NotAfter:     notBefore.Add(10 * time.Minute),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageCodeSigning},
	}
	if o.sanURI != "" {
		u := mustParseURL(t, o.sanURI)
		tmpl.URIs = append(tmpl.URIs, u)
	}
	if o.issuer != "" {
		oid := o.issuerOID
		if oid == nil {
			oid = oidIssuerV2
		}
		value := []byte(o.issuer)
		if oid.Equal(oidIssuerV2) {
			der, err := asn1.Marshal(o.issuer)
			if err != nil {
				t.Fatal(err)
			}
			value = der
		}
		tmpl.ExtraExtensions = append(tmpl.ExtraExtensions, pkix.Extension{Id: oid, Value: value})
	}

	parent, signer := c.interCert, any(c.interKey)
	if o.selfSigned {
		parent, signer = tmpl, any(leafKey)
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent, &leafKey.PublicKey, signer)
	if err != nil {
		t.Fatal(err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), leafKey
}

// signBlob produces what cosign writes to <artifact>.sig: base64 over an
// ASN.1 ECDSA signature of the blob's SHA-256.
func signBlob(t *testing.T, key *ecdsa.PrivateKey, blob []byte) []byte {
	t.Helper()
	sum := sha256.Sum256(blob)
	sig, err := ecdsa.SignASN1(rand.Reader, key, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return []byte(base64.StdEncoding.EncodeToString(sig) + "\n")
}

func useTestCA(t *testing.T, ca *testCA) {
	t.Helper()
	prev := fulcioAnchors
	fulcioAnchors = func() (trustAnchors, error) { return ca.anchors, nil }
	t.Cleanup(func() { fulcioAnchors = prev })
}

const goodSAN = "https://github.com/babtix/kaioken/.github/workflows/release.yaml@refs/tags/v1.2.3"

// The happy path: a certificate from our workflow, chaining to the trusted
// root, signing the bytes we actually verify.
func TestVerifyBlobSignatureAcceptsGenuineSignature(t *testing.T) {
	ca := newTestCA(t)
	useTestCA(t, ca)
	blob := []byte("deadbeef  kaioken-v1.2.3-linux-amd64\n")

	certPEM, key := ca.issueLeaf(t, leafOpts{sanURI: goodSAN, issuer: certIssuer})
	if err := verifyBlobSignature(blob, signBlob(t, key, blob), certPEM); err != nil {
		t.Fatalf("genuine signature rejected: %v", err)
	}
}

// Each of these is a distinct way an upgrade could be subverted. All must be
// refused, and refused for the stated reason rather than by accident.
func TestVerifyBlobSignatureRejections(t *testing.T) {
	blob := []byte("deadbeef  kaioken-v1.2.3-linux-amd64\n")

	cases := []struct {
		name    string
		opts    leafOpts
		mutate  func(t *testing.T, blob, sig, cert []byte) (b, s, c []byte)
		wantSub string
	}{
		{
			name:    "signature over different bytes",
			opts:    leafOpts{sanURI: goodSAN, issuer: certIssuer},
			mutate:  func(_ *testing.T, b, s, c []byte) ([]byte, []byte, []byte) { return []byte("tampered\n"), s, c },
			wantSub: "does not match checksums.txt",
		},
		{
			name:    "certificate for a different repository",
			opts:    leafOpts{sanURI: "https://github.com/attacker/evil/.github/workflows/go.yml@refs/heads/main", issuer: certIssuer},
			wantSub: "is not for babtix/kaioken",
		},
		{
			name:    "no SAN at all",
			opts:    leafOpts{issuer: certIssuer},
			wantSub: "is not for babtix/kaioken",
		},
		{
			name:    "identity from another OIDC issuer",
			opts:    leafOpts{sanURI: goodSAN, issuer: "https://gitlab.com"},
			wantSub: "not \"https://token.actions.githubusercontent.com\"",
		},
		{
			name:    "no issuer extension",
			opts:    leafOpts{sanURI: goodSAN},
			wantSub: "records no OIDC issuer",
		},
		{
			// The whole point of pinning a root: a forged certificate can
			// claim any identity it likes, so identity alone proves nothing.
			name:    "self-signed certificate claiming our identity",
			opts:    leafOpts{sanURI: goodSAN, issuer: certIssuer, selfSigned: true},
			wantSub: "does not chain to Fulcio",
		},
		{
			name:    "signature is not base64",
			opts:    leafOpts{sanURI: goodSAN, issuer: certIssuer},
			mutate:  func(_ *testing.T, b, s, c []byte) ([]byte, []byte, []byte) { return b, []byte("!!!not base64!!!"), c },
			wantSub: "not valid base64",
		},
		{
			name:    "certificate is not a certificate",
			opts:    leafOpts{sanURI: goodSAN, issuer: certIssuer},
			mutate:  func(_ *testing.T, b, s, c []byte) ([]byte, []byte, []byte) { return b, s, []byte("nope") },
			wantSub: "not a PEM certificate",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ca := newTestCA(t)
			useTestCA(t, ca)
			certPEM, key := ca.issueLeaf(t, c.opts)
			sig := signBlob(t, key, blob)
			b, s, cert := blob, sig, certPEM
			if c.mutate != nil {
				b, s, cert = c.mutate(t, blob, sig, certPEM)
			}
			err := verifyBlobSignature(b, s, cert)
			if err == nil {
				t.Fatal("verification succeeded; it must refuse")
			}
			if !strings.Contains(err.Error(), c.wantSub) {
				t.Errorf("error = %q, want it to mention %q", err, c.wantSub)
			}
		})
	}
}

// A signature made while the certificate was valid must keep verifying long
// after that ten-minute window closes — otherwise every release older than
// ten minutes would be uninstallable.
func TestVerifyBlobSignatureAcceptsExpiredEphemeralCert(t *testing.T) {
	ca := newTestCA(t)
	useTestCA(t, ca)
	blob := []byte("deadbeef  kaioken-v1.2.3-linux-amd64\n")

	certPEM, key := ca.issueLeaf(t, leafOpts{
		sanURI:    goodSAN,
		issuer:    certIssuer,
		notBefore: time.Now().Add(-365 * 24 * time.Hour),
	})
	if err := verifyBlobSignature(blob, signBlob(t, key, blob), certPEM); err != nil {
		t.Fatalf("year-old release signature rejected: %v", err)
	}
}

// The legacy issuer extension carries a bare string rather than DER.
func TestVerifyBlobSignatureAcceptsLegacyIssuerExtension(t *testing.T) {
	ca := newTestCA(t)
	useTestCA(t, ca)
	blob := []byte("x")
	certPEM, key := ca.issueLeaf(t, leafOpts{sanURI: goodSAN, issuer: certIssuer, issuerOID: oidIssuerV1})
	if err := verifyBlobSignature(blob, signBlob(t, key, blob), certPEM); err != nil {
		t.Fatalf("v1 issuer extension rejected: %v", err)
	}
}

// --- the whole gate ---

// verifyRelease must refuse before it downloads anything when the release did
// not publish the material that makes verification possible. This is the
// fail-open hole: it used to print a warning and install the binary anyway.
func TestVerifyReleaseRefusesUnsignedRelease(t *testing.T) {
	cases := []struct {
		name    string
		rel     *Release
		wantSub string
	}{
		{"no checksums", &Release{Version: "1.2.3"}, "ships no checksums.txt"},
		{"no signature", &Release{Version: "1.2.3", ChecksumURL: "https://x/c"}, "ships no checksums.txt.sig"},
		{"no certificate", &Release{Version: "1.2.3", ChecksumURL: "https://x/c", ChecksumSigURL: "https://x/s"}, "ships no checksums.txt.pem"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := verifyRelease(context.Background(), "unused", c.rel)
			if err == nil {
				t.Fatal("unsigned release accepted")
			}
			if !strings.Contains(err.Error(), c.wantSub) {
				t.Errorf("error = %q, want it to mention %q", err, c.wantSub)
			}
		})
	}
}

// End to end over HTTP: a served, signed checksums.txt and a staged binary
// whose hash it names.
func TestVerifyReleaseEndToEnd(t *testing.T) {
	ca := newTestCA(t)
	useTestCA(t, ca)

	dir := t.TempDir()
	staged := filepath.Join(dir, "kaioken.new")
	payload := []byte("this is the binary\n")
	if err := os.WriteFile(staged, payload, 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(payload)
	assetName := "kaioken-v1.2.3-linux-amd64"
	checksums := []byte(fmt.Sprintf("%s  %s\n%s  other-artifact\n", hex.EncodeToString(sum[:]), assetName, strings.Repeat("0", 64)))

	certPEM, key := ca.issueLeaf(t, leafOpts{sanURI: goodSAN, issuer: certIssuer})
	sig := signBlob(t, key, checksums)

	mux := http.NewServeMux()
	mux.HandleFunc("/checksums.txt", func(w http.ResponseWriter, _ *http.Request) { w.Write(checksums) })
	mux.HandleFunc("/checksums.txt.sig", func(w http.ResponseWriter, _ *http.Request) { w.Write(sig) })
	mux.HandleFunc("/checksums.txt.pem", func(w http.ResponseWriter, _ *http.Request) { w.Write(certPEM) })
	srv := httptest.NewServer(mux)
	defer srv.Close()

	rel := &Release{
		Version:         "1.2.3",
		AssetName:       assetName,
		ChecksumURL:     srv.URL + "/checksums.txt",
		ChecksumSigURL:  srv.URL + "/checksums.txt.sig",
		ChecksumCertURL: srv.URL + "/checksums.txt.pem",
	}
	if err := verifyRelease(context.Background(), staged, rel); err != nil {
		t.Fatalf("genuine release rejected: %v", err)
	}

	// Swapping the binary after signing must be caught by the hash, and
	// swapping checksums.txt to match must be caught by the signature.
	if err := os.WriteFile(staged, []byte("malware\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := verifyRelease(context.Background(), staged, rel); err == nil {
		t.Error("a binary that does not match checksums.txt was accepted")
	} else if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Errorf("error = %q, want a checksum mismatch", err)
	}
}

// An asset the signed checksums.txt says nothing about is not covered by the
// signature, so it must not be installed either.
func TestVerifyReleaseRefusesUnlistedAsset(t *testing.T) {
	dir := t.TempDir()
	staged := filepath.Join(dir, "kaioken.new")
	if err := os.WriteFile(staged, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := matchChecksum(staged, []byte("aaaa  some-other-file\n"), "kaioken-v1.2.3-linux-amd64")
	if err == nil || !strings.Contains(err.Error(), "no entry for") {
		t.Errorf("error = %v, want a complaint about the missing entry", err)
	}
}

// --- the pinned bundle itself ---

// A refresh of fulcio_roots.pem that lands a malformed or root-less bundle
// would disable chain verification for everyone; fail here instead.
func TestPinnedFulcioBundleIsUsable(t *testing.T) {
	a, err := loadFulcioAnchors()
	if err != nil {
		t.Fatalf("pinned Fulcio bundle does not parse: %v", err)
	}
	if len(a.roots.Subjects()) == 0 { //nolint:staticcheck // Subjects() is fine for a length check on a pool we built
		t.Error("pinned bundle contains no self-signed root")
	}
}
