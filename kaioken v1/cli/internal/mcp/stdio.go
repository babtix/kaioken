package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
)

// stdioMaxLine caps one inbound frame (10 MB), same ceiling internal/ext puts
// on servers it talks to.
const stdioMaxLine = 10 << 20

// ServeStdio runs the newline-delimited JSON-RPC loop over r/w until the
// reader closes or ctx is cancelled. Requests are handled one at a time: MCP
// clients pipeline rarely, and serialising keeps tool side effects ordered.
func (s *Server) ServeStdio(ctx context.Context, r io.Reader, w io.Writer) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), stdioMaxLine)

	enc := json.NewEncoder(w)
	// A stdout frame must be exactly one line; Go's encoder already appends
	// the newline and escapes nothing that would break framing.
	flush, _ := w.(interface{ Sync() error })

	s.log.info("stdio transport ready", "repo", s.repo, "tools", joinNames(sortedNames(s.tools)))

	// A cancelled context has to interrupt a blocking Read, which Scan gives
	// no hook for — closing stdin from the watcher is the portable way out.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			if f, ok := r.(*os.File); ok {
				f.Close()
			}
		case <-done:
		}
	}()

	for sc.Scan() {
		line := sc.Bytes()
		if len(trimSpaceBytes(line)) == 0 {
			continue
		}
		var req request
		if err := json.Unmarshal(line, &req); err != nil {
			s.log.warn("parse error", "error", err.Error())
			if werr := enc.Encode(failure(nil, errf(codeParseError, "invalid JSON: %v", err))); werr != nil {
				return werr
			}
			continue
		}
		resp := s.Handle(ctx, &req)
		if resp == nil {
			continue
		}
		if err := enc.Encode(resp); err != nil {
			return err
		}
		if flush != nil {
			flush.Sync()
		}
	}
	err := sc.Err()
	switch {
	case err == nil, errors.Is(err, io.EOF), errors.Is(err, os.ErrClosed):
		// Client closed the pipe, or ctx cancellation closed it for us. Either
		// way this is a clean shutdown, which is how MCP clients stop servers.
		s.log.info("stdio transport closed")
		return nil
	default:
		return err
	}
}

func trimSpaceBytes(b []byte) []byte {
	start := 0
	for start < len(b) && isSpaceByte(b[start]) {
		start++
	}
	end := len(b)
	for end > start && isSpaceByte(b[end-1]) {
		end--
	}
	return b[start:end]
}

func isSpaceByte(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

func joinNames(names []string) string {
	out := ""
	for i, n := range names {
		if i > 0 {
			out += ","
		}
		out += n
	}
	return out
}
