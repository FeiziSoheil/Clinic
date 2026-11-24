// Package redis provides a small, dependency-free Redis client sufficient for the
// OTP authentication flow.
//
// It speaks the Redis Serialization Protocol (RESP) directly over pooled TCP
// connections using only the Go standard library, so the project gains a Redis
// client without pulling in a third-party module. Only the handful of commands
// the OTP store needs are implemented (SET with TTL, GET, DEL, INCR, EXPIRE,
// TTL, PING), but each is a thin wrapper over a general command sender so adding
// more is trivial.
//
// Per the project's Clean Architecture rules this package lives in pkg/ and
// therefore MUST NOT import anything from internal/.
package redis

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// poolSize is the steady-state upper bound on cached idle connections. Under a
// burst a few extra may be dialed, but released idle connections beyond this are
// closed rather than cached, preventing unbounded growth.
const poolSize = 16

// defaultCmdTimeout bounds a single command when the caller's context carries no
// deadline, so a stalled Redis cannot hang a request indefinitely.
const defaultCmdTimeout = 5 * time.Second

// ErrNil is returned by Get when the requested key does not exist (Redis nil
// bulk reply).
var ErrNil = errors.New("redis: nil")

// Client is a pooled, goroutine-safe Redis client. It is created once (during
// bootstrap) and reused for the lifetime of the process.
type Client struct {
	addr     string
	password string
	db       int
	pool     chan *pooledConn
}

// pooledConn wraps a long-lived TCP connection together with a buffered reader
// for reading RESP replies.
type pooledConn struct {
	c  net.Conn
	br *bufio.Reader
}

// Connect parses rawURL, opens a connection pool and verifies reachability with
// a PING. The URL may be any of:
//
//	redis://localhost:6379
//	redis://:password@host:6379/0
//	redis://user:password@host:6379/2
//	host:port
//
// An empty url is a fatal misconfiguration (the OTP flow cannot operate without
// Redis).
func Connect(ctx context.Context, rawURL string) (*Client, error) {
	if rawURL == "" {
		return nil, fmt.Errorf("redis: url must not be empty")
	}
	addr, password, db, err := parseURL(rawURL)
	if err != nil {
		return nil, err
	}

	c := &Client{
		addr:     addr,
		password: password,
		db:       db,
		pool:     make(chan *pooledConn, poolSize),
	}

	// Verify reachability once at startup so a down instance fails fast.
	if err := c.Ping(ctx); err != nil {
		c.Close()
		return nil, err
	}
	return c, nil
}

// parseURL extracts the TCP address, optional password and DB index from a Redis
// URL. A bare "host:port" (no scheme) is also accepted.
func parseURL(rawURL string) (addr, password string, db int, err error) {
	if !strings.Contains(rawURL, "://") {
		// Bare "host:port".
		return rawURL, "", 0, nil
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", 0, fmt.Errorf("redis: parse url %q: %w", rawURL, err)
	}
	host := u.Host
	if host == "" {
		return "", "", 0, fmt.Errorf("redis: url %q has no host", rawURL)
	}
	// Ensure a port: net.SplitHostPort distinguishes "host" from "host:port".
	if _, _, lerr := net.SplitHostPort(host); lerr != nil {
		host = net.JoinHostPort(host, "6379")
	}
	if u.User != nil {
		if pw, ok := u.User.Password(); ok {
			password = pw
		}
	}
	if u.Path != "" && u.Path != "/" {
		dbNum, derr := strconv.Atoi(strings.TrimPrefix(u.Path, "/"))
		if derr != nil {
			return "", "", 0, fmt.Errorf("redis: invalid db %q: %w", u.Path, derr)
		}
		db = dbNum
	}
	return host, password, db, nil
}

// Close releases every cached idle connection in the pool.
func (c *Client) Close() error {
	for {
		select {
		case pc := <-c.pool:
			_ = pc.c.Close()
		default:
			return nil
		}
	}
}

// dial opens a fresh connection and performs the optional AUTH + SELECT handshake
// so the connection is ready to run commands.
func (c *Client) dial(ctx context.Context) (*pooledConn, error) {
	d := net.Dialer{}
	if deadline, ok := ctx.Deadline(); ok {
		d.Deadline = deadline
	}
	conn, err := d.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		return nil, fmt.Errorf("redis: dial %s: %w", c.addr, err)
	}
	pc := &pooledConn{c: conn, br: bufio.NewReader(conn)}

	if c.password != "" {
		if err := pc.run(c.cmdDeadline(ctx), "AUTH", c.password); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("redis: auth: %w", err)
		}
	}
	if c.db != 0 {
		if err := pc.run(c.cmdDeadline(ctx), "SELECT", strconv.Itoa(c.db)); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("redis: select db: %w", err)
		}
	}
	return pc, nil
}

// acquire fetches an idle connection from the pool or dials a new one.
func (c *Client) acquire(ctx context.Context) (*pooledConn, error) {
	select {
	case pc := <-c.pool:
		return pc, nil
	default:
		return c.dial(ctx)
	}
}

// release returns an idle connection to the pool, closing it when the pool is
// already full so the cached count never grows beyond poolSize.
func (c *Client) release(pc *pooledConn) {
	select {
	case c.pool <- pc:
	default:
		_ = pc.c.Close()
	}
}

// cmdDeadline derives the deadline for a single command from the context, or
// falls back to defaultCmdTimeout.
func (c *Client) cmdDeadline(ctx context.Context) time.Time {
	if deadline, ok := ctx.Deadline(); ok {
		return deadline
	}
	return time.Now().Add(defaultCmdTimeout)
}

// do runs a single command on a pooled connection, returning the raw reply. On a
// connection-level failure the connection is discarded; on a Redis error reply
// (or success) it is recycled.
func (c *Client) do(ctx context.Context, args ...string) (any, error) {
	pc, err := c.acquire(ctx)
	if err != nil {
		return nil, err
	}
	if err := pc.c.SetDeadline(c.cmdDeadline(ctx)); err != nil {
		_ = pc.c.Close()
		return nil, err
	}
	if err := writeCommand(pc.c, args); err != nil {
		_ = pc.c.Close()
		return nil, err
	}
	reply, err := readReply(pc.br)
	if err != nil {
		// A Redis error reply ("-ERR …") leaves the connection usable; an I/O
		// error does not, so only the latter discards the connection.
		if isIOError(err) {
			_ = pc.c.Close()
			return nil, err
		}
		c.release(pc)
		return nil, err
	}
	c.release(pc)
	return reply, nil
}

// run is a convenience that executes a command and treats any reply as "ok as
// long as it is not an error". Used for AUTH/SELECT/PING/SET/DEL/EXPIRE.
func (pc *pooledConn) run(deadline time.Time, args ...string) error {
	_ = pc.c.SetDeadline(deadline)
	if err := writeCommand(pc.c, args); err != nil {
		return err
	}
	_, err := readReply(pc.br)
	return err
}

// Ping verifies the connection with a round-trip PING.
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.do(ctx, "PING")
	return err
}

// Set stores value at key with the given TTL (SET key value EX ttl). A zero ttl
// stores the key with no expiry.
func (c *Client) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	args := []string{"SET", key, value}
	if ttl > 0 {
		args = append(args, "EX", strconv.FormatInt(int64(ttl.Seconds()), 10))
	}
	_, err := c.do(ctx, args...)
	return err
}

// Get returns the string value at key. It returns ("", false, nil) when the key
// does not exist and the value otherwise.
func (c *Client) Get(ctx context.Context, key string) (string, bool, error) {
	reply, err := c.do(ctx, "GET", key)
	if err != nil {
		if errors.Is(err, ErrNil) {
			return "", false, nil
		}
		return "", false, err
	}
	s, ok := reply.(string)
	if !ok {
		return "", false, fmt.Errorf("redis: unexpected GET reply type %T", reply)
	}
	return s, true, nil
}

// Del removes the given keys (ignoring keys that do not exist).
func (c *Client) Del(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	args := append([]string{"DEL"}, keys...)
	_, err := c.do(ctx, args...)
	return err
}

// Incr atomically increments the integer at key by one, initializing it to 1 when
// it does not exist, and returns the new value.
func (c *Client) Incr(ctx context.Context, key string) (int64, error) {
	reply, err := c.do(ctx, "INCR", key)
	if err != nil {
		return 0, err
	}
	n, ok := reply.(int64)
	if !ok {
		return 0, fmt.Errorf("redis: unexpected INCR reply type %T", reply)
	}
	return n, nil
}

// Expire sets a TTL on key (EXPIRE key ttl). A key without an existing TTL or a
// missing key is a no-op.
func (c *Client) Expire(ctx context.Context, key string, ttl time.Duration) error {
	_, err := c.do(ctx, "EXPIRE", key, strconv.FormatInt(int64(ttl.Seconds()), 10))
	return err
}

// TTL returns the remaining time-to-live for key. A missing key or a key with no
// expiry both report as 0.
func (c *Client) TTL(ctx context.Context, key string) (time.Duration, error) {
	reply, err := c.do(ctx, "TTL", key)
	if err != nil {
		return 0, err
	}
	n, ok := reply.(int64)
	if !ok {
		return 0, fmt.Errorf("redis: unexpected TTL reply type %T", reply)
	}
	if n < 0 {
		// -1 (no expiry) and -2 (missing) both mean "no active countdown".
		return 0, nil
	}
	return time.Duration(n) * time.Second, nil
}

// ---------------------------------------------------------------------------
// RESP protocol (encoding requests + decoding replies).
// ---------------------------------------------------------------------------

// writeCommand serializes args as a RESP array of bulk strings and writes it.
func writeCommand(w io.Writer, args []string) error {
	var b strings.Builder
	b.Grow(16)
	b.WriteByte('*')
	b.WriteString(strconv.Itoa(len(args)))
	b.WriteString("\r\n")
	for _, a := range args {
		b.WriteByte('$')
		b.WriteString(strconv.Itoa(len(a)))
		b.WriteString("\r\n")
		b.WriteString(a)
		b.WriteString("\r\n")
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// readReply decodes one RESP reply into a Go value:
//   - simple string "+OK"  → string
//   - error        "-ERR …" → error (wrapping ErrNil is NOT used here)
//   - integer      ":42"    → int64
//   - bulk string  "$3\r\nfoo\r\n" → string; "$-1" → ErrNil
//   - array        is not produced by any command this client runs; if seen it
//     is reported as an error to surface unexpected server replies loudly.
func readReply(br *bufio.Reader) (any, error) {
	line, err := br.ReadString('\n')
	if err != nil {
		return nil, err
	}
	line = strings.TrimRight(line, "\r\n")
	if len(line) == 0 {
		return nil, fmt.Errorf("redis: empty reply")
	}
	switch line[0] {
	case '+':
		return line[1:], nil
	case '-':
		return nil, &errReply{msg: line[1:]}
	case ':':
		n, err := strconv.ParseInt(line[1:], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("redis: bad integer %q: %w", line, err)
		}
		return n, nil
	case '$':
		n, err := strconv.ParseInt(line[1:], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("redis: bad bulk length %q: %w", line, err)
		}
		if n < 0 {
			// -1 means nil (key absent for GET).
			return nil, ErrNil
		}
		buf := make([]byte, n+2) // payload + trailing \r\n
		if _, err := io.ReadFull(br, buf); err != nil {
			return nil, err
		}
		return string(buf[:n]), nil
	case '*':
		return nil, fmt.Errorf("redis: array reply not supported by this client (%q)", line)
	default:
		return nil, fmt.Errorf("redis: unknown reply type %q", line)
	}
}

// errReply carries a Redis "-ERR …" message. It is NOT a connection error, so
// the connection stays usable after one.
type errReply struct {
	msg string
}

func (e *errReply) Error() string { return "redis: " + e.msg }

// isIOError reports whether err is a connection/transport failure (as opposed to
// a Redis error reply), indicating the connection should be discarded.
func isIOError(err error) bool {
	var er *errReply
	return !errors.As(err, &er)
}
