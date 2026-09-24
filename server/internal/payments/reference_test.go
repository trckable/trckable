package payments

import "testing"

// A checkout reference is only a visitor when it is trckable's own form.
func TestSomeoneElsesReferenceIsNoVisitor(t *testing.T) {
	if strictVisitor("order_123") != 0 {
		t.Fatal("someone else's reference counted")
	}
	if visitorFrom(map[string]any{"reference_id": "trckable_k3j2_m1a2b3"}) == 0 {
		t.Fatal("trckable's own reference")
	}
}
