package selfupdate

// Keyless signature verification for release artifacts.
//
// What the release pipeline actually produces (.goreleaser.yaml, `signs:` with
// `artifacts: checksum`) is a cosign keyless signature over checksums.txt,
// together with the short-lived Fulcio certificate it was signed with:
//
//	checksums.txt        SHA-256 of every artifact in the release
//	checksums.txt.sig    base64 ECDSA signature over checksums.txt
//	checksums.txt.pem    the Fulcio leaf certificate that made it
//
// Signing the checksum file transitively covers every binary listed in it, so
// the chain of custody for an upgrade runs:
//
//	pinned Fulcio root
//	  → leaf certificate, whose SAN says "GitHub Actions, in this repository"
//	    → signature over checksums.txt
//	      → SHA-256 of the binary we are about to execute as ourselves
//
// Each link is required. Dropping the identity check would accept a signature
// from anyone Fulcio has ever issued a certificate to; dropping the chain
// check would accept a self-signed certificate claiming any identity at all.
//
// NOT verified: the Rekor transparency-log inclusion proof, and the SCT
// embedded in the certificate. Their absence is why the chain below is
// validated as of the leaf's own NotBefore rather than as of now — Fulcio
// certificates are valid for about ten minutes, so checking one against the
// current time would reject every release older than that. The practical
// consequence is that we take the certificate's word for when it was issued.
// Closing that gap means adopting sigstore-go and its TUF client; the pinned
// roots below are the deliberate trade-off in the meantime.

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/x509"
	_ "embed"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
)

// certIdentityPattern is the certificate SAN a release signature must carry:
// a workflow belonging to this repository. It mirrors the
// --certificate-identity-regexp the release workflow re-verifies with, so the
// publisher and the client agree on who is allowed to sign.
//
// Built per call rather than once at init because Repo is a var: pinning the
// pattern at init would keep trusting the old repository after a caller
// retargets it, which is precisely the check that must not go stale.
func certIdentityPattern() *regexp.Regexp {
	return regexp.MustCompile(`^https://github\.com/` + regexp.QuoteMeta(Repo) + `/`)
}

// certIssuer is the OIDC issuer that minted the identity. Only GitHub Actions
// can vouch for the workflow identity above; any other issuer means the
// certificate was obtained some other way.
const certIssuer = "https://token.actions.githubusercontent.com"

// Fulcio records the OIDC issuer in a certificate extension. 1.1 is the
// original, holding a bare UTF-8 string; 1.8 is its replacement, holding a
// DER-encoded UTF8String. Certificates in the wild carry one or both.
var (
	oidIssuerV1 = asn1.ObjectIdentifier{1, 3, 6, 1, 4, 1, 57264, 1, 1}
	oidIssuerV2 = asn1.ObjectIdentifier{1, 3, 6, 1, 4, 1, 57264, 1, 8}
)

// fulcioRootsPEM is the public-good Fulcio trust bundle, pinned at build
// time. Sigstore rotates these rarely, but when it does, an unrotated copy
// here rejects every new release rather than accepting a bad one — the safe
// direction to fail, and a loud one. Refresh from
// https://fulcio.sigstore.dev/api/v2/trustBundle.
//
//go:embed fulcio_roots.pem
var fulcioRootsPEM []byte

type trustAnchors struct {
	roots         *x509.CertPool
	intermediates *x509.CertPool
}

var (
	anchorsOnce sync.Once
	anchors     trustAnchors
	anchorsErr  error
)

// fulcioAnchors returns the trust anchors a leaf must chain to. It is a var
// so tests can substitute a certificate authority they control — the one
// piece of this file that cannot be exercised against the real Fulcio
// offline.
var fulcioAnchors = loadFulcioAnchors

// loadFulcioAnchors parses the pinned bundle into root and intermediate
// pools. Self-signed certificates become roots and the rest intermediates, so
// the order certificates happen to appear in the bundle does not matter.
func loadFulcioAnchors() (trustAnchors, error) {
	anchorsOnce.Do(func() {
		roots, intermediates := x509.NewCertPool(), x509.NewCertPool()
		n := 0
		rest := fulcioRootsPEM
		for {
			var block *pem.Block
			block, rest = pem.Decode(rest)
			if block == nil {
				break
			}
			if block.Type != "CERTIFICATE" {
				continue
			}
			c, err := x509.ParseCertificate(block.Bytes)
			if err != nil {
				anchorsErr = fmt.Errorf("parsing pinned Fulcio bundle: %w", err)
				return
			}
			n++
			if bytes.Equal(c.RawIssuer, c.RawSubject) {
				roots.AddCert(c)
			} else {
				intermediates.AddCert(c)
			}
		}
		if n == 0 {
			anchorsErr = fmt.Errorf("pinned Fulcio bundle contains no certificates")
			return
		}
		anchors = trustAnchors{roots: roots, intermediates: intermediates}
	})
	return anchors, anchorsErr
}

// verifyBlobSignature checks that sig is a valid signature over blob, made by
// a certificate that Fulcio issued to this repository's release workflow.
func verifyBlobSignature(blob, sigB64, certPEM []byte) error {
	leaf, err := parseLeaf(certPEM)
	if err != nil {
		return err
	}
	if err := checkIdentity(leaf); err != nil {
		return err
	}
	if err := checkChain(leaf); err != nil {
		return err
	}

	sig, err := decodeSignature(sigB64)
	if err != nil {
		return err
	}
	alg, err := signatureAlgorithm(leaf)
	if err != nil {
		return err
	}
	if err := leaf.CheckSignature(alg, blob, sig); err != nil {
		return fmt.Errorf("signature does not match checksums.txt: %w — refusing to install", err)
	}
	return nil
}

func parseLeaf(certPEM []byte) (*x509.Certificate, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, fmt.Errorf("signature certificate is not a PEM certificate")
	}
	leaf, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parsing signature certificate: %w", err)
	}
	return leaf, nil
}

// checkIdentity enforces who signed: a workflow in this repository, vouched
// for by GitHub's OIDC issuer.
func checkIdentity(leaf *x509.Certificate) error {
	identity := ""
	want := certIdentityPattern()
	for _, u := range leaf.URIs {
		if want.MatchString(u.String()) {
			identity = u.String()
			break
		}
	}
	if identity == "" {
		return fmt.Errorf("signature certificate is not for %s (SAN: %v) — refusing to install", Repo, leaf.URIs)
	}
	issuer, ok := certOIDCIssuer(leaf)
	if !ok {
		return fmt.Errorf("signature certificate records no OIDC issuer — refusing to install")
	}
	if issuer != certIssuer {
		return fmt.Errorf("signature certificate was issued via %q, not %q — refusing to install", issuer, certIssuer)
	}
	return nil
}

// certOIDCIssuer reads the Fulcio issuer extension, preferring the DER-encoded
// v2 form and falling back to the bare-string v1 form.
func certOIDCIssuer(leaf *x509.Certificate) (string, bool) {
	for _, ext := range leaf.Extensions {
		switch {
		case ext.Id.Equal(oidIssuerV2):
			var s string
			if _, err := asn1.Unmarshal(ext.Value, &s); err == nil && s != "" {
				return s, true
			}
		case ext.Id.Equal(oidIssuerV1):
			if v := strings.TrimSpace(string(ext.Value)); v != "" {
				return v, true
			}
		}
	}
	return "", false
}

// checkChain verifies the leaf against the pinned Fulcio anchors, as of the
// certificate's own issuance rather than now — see the package note above on
// why the current time is the wrong question for a ten-minute certificate.
func checkChain(leaf *x509.Certificate) error {
	a, err := fulcioAnchors()
	if err != nil {
		return err
	}
	_, err = leaf.Verify(x509.VerifyOptions{
		Roots:         a.roots,
		Intermediates: a.intermediates,
		CurrentTime:   leaf.NotBefore,
		KeyUsages:     []x509.ExtKeyUsage{x509.ExtKeyUsageCodeSigning},
	})
	if err != nil {
		return fmt.Errorf("signature certificate does not chain to Fulcio: %w — refusing to install", err)
	}
	return nil
}

// decodeSignature accepts the base64 cosign writes, tolerating the trailing
// newline a shell redirect leaves behind.
func decodeSignature(sigB64 []byte) ([]byte, error) {
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(sigB64)))
	if err != nil {
		return nil, fmt.Errorf("signature is not valid base64: %w", err)
	}
	if len(sig) == 0 {
		return nil, fmt.Errorf("signature is empty")
	}
	return sig, nil
}

func signatureAlgorithm(leaf *x509.Certificate) (x509.SignatureAlgorithm, error) {
	switch leaf.PublicKeyAlgorithm {
	case x509.ECDSA:
		return x509.ECDSAWithSHA256, nil
	case x509.RSA:
		return x509.SHA256WithRSA, nil
	case x509.Ed25519:
		return x509.PureEd25519, nil
	default:
		return 0, fmt.Errorf("unsupported signing key type %s", leaf.PublicKeyAlgorithm)
	}
}

// verifyRelease is the whole gate an upgrade passes through: the release must
// ship a signed checksums.txt, the signature must be this repository's, and
// the staged binary must be the file that checksums.txt names.
//
// Every branch is fatal. A release missing any of the three artifacts is not
// "unverified but probably fine" — it is indistinguishable from one whose
// artifacts were removed to get past this check.
func verifyRelease(ctx context.Context, staged string, rel *Release) error {
	switch {
	case rel.ChecksumURL == "":
		return fmt.Errorf("release %s ships no checksums.txt — refusing to install an unverified binary", rel.Version)
	case rel.ChecksumSigURL == "":
		return fmt.Errorf("release %s ships no checksums.txt.sig — refusing to install an unsigned binary", rel.Version)
	case rel.ChecksumCertURL == "":
		return fmt.Errorf("release %s ships no checksums.txt.pem — refusing to install an unsigned binary", rel.Version)
	}

	checksums, err := fetchAll(ctx, rel.ChecksumURL)
	if err != nil {
		return fmt.Errorf("fetching checksums.txt: %w", err)
	}
	sigB64, err := fetchAll(ctx, rel.ChecksumSigURL)
	if err != nil {
		return fmt.Errorf("fetching checksums.txt.sig: %w", err)
	}
	certPEM, err := fetchAll(ctx, rel.ChecksumCertURL)
	if err != nil {
		return fmt.Errorf("fetching checksums.txt.pem: %w", err)
	}

	// Signature first: matching a hash against a checksums.txt nobody vouched
	// for proves only that the download was not corrupted in transit.
	if err := verifyBlobSignature(checksums, sigB64, certPEM); err != nil {
		return err
	}
	return matchChecksum(staged, checksums, rel.AssetName)
}

func fetchAll(ctx context.Context, url string) ([]byte, error) {
	resp, err := get(ctx, url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	// Signature material is tiny; a bound keeps a hostile response from
	// becoming a memory problem before it becomes a verification failure.
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// matchChecksum compares the staged file against its line in the verified
// checksums.txt. Format: "<hex>  <name>".
func matchChecksum(staged string, checksums []byte, assetName string) error {
	want := ""
	for _, line := range strings.Split(string(checksums), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == assetName {
			want = strings.ToLower(fields[0])
			break
		}
	}
	if want == "" {
		return fmt.Errorf("checksums.txt has no entry for %s — refusing to install", assetName)
	}

	sum, err := fileSHA256(staged)
	if err != nil {
		return err
	}
	if sum != want {
		return fmt.Errorf("checksum mismatch for %s: got %s, want %s — download corrupted or tampered, not installed", assetName, sum, want)
	}
	return nil
}

func fileSHA256(path string) (string, error) {
	f, err := openFile(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
