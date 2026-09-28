package auth

import "testing"

func TestPasswordHashing(t *testing.T) {
	h, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(h, "correct horse battery") || VerifyPassword(h, "correct horse batterY") {
		t.Fatal("verify mismatch")
	}
	h2, _ := HashPassword("correct horse battery")
	if h == h2 {
		t.Fatal("hashes must be salted")
	}
	if VerifyPassword("garbage", "x") || VerifyPassword("argon2id$v=19$m=1,t=1,p=1$$", "x") {
		t.Fatal("malformed hash accepted")
	}
}

func TestHostileHashesAreRejectedWithoutWork(t *testing.T) {
	for _, h := range []string{
		"argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$",                          // empty key (used to panic)
		"argon2id$v=19$m=99999999,t=2,p=1$c2FsdHNhbHQ$c2FsdHNhbHRzYWx0c2FsdA", // memory bomb
		"argon2id$v=19$m=19456,t=999,p=1$c2FsdHNhbHQ$c2FsdHNhbHRzYWx0c2FsdA",  // CPU bomb
	} {
		if VerifyPassword(h, "x") {
			t.Fatalf("accepted %q", h)
		}
	}
}
