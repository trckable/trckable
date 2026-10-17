package sqlite

import (
	"context"
	"testing"
)

func TestSetupMarks(t *testing.T) {
	ctx := context.Background()
	st := openT(t)
	site, _ := st.CreateSite(ctx, DefaultAccount, "a.com", "")
	other, _ := st.CreateSite(ctx, DefaultAccount, "b.com", "")

	if got, err := st.SetupOf(ctx, site); err != nil || got.Kind != "" || got.KindChosen || len(got.Skips) != 0 {
		t.Fatalf("a site with no marks: %+v %v", got, err)
	}
	st.SeenProxied(ctx, site, 100)
	st.SeenProxied(ctx, site, 50) // older: kept at 100
	st.SeenProxied(ctx, "tkb_nosuchsite", 100)
	if err := st.ConfirmLocale(ctx, site, 7); err != nil {
		t.Fatal(err)
	}
	if err := st.SetSkip(ctx, site, "payments", true, 1); err != nil {
		t.Fatal(err)
	}
	if err := st.SetSkip(ctx, site, "funnel", true, 1); err != nil {
		t.Fatal(err)
	}
	if err := st.SetSkip(ctx, site, "funnel", false, 2); err != nil {
		t.Fatal(err)
	}
	got, _ := st.SetupOf(ctx, site)
	if got.ProxySeenAt != 100 || got.LocaleConfirmedAt != 7 || got.Skips["payments"] != SkipSkipped || got.Skips["funnel"] != SkipKept {
		t.Fatalf("marks: %+v", got)
	}
	if o, _ := st.SetupOf(ctx, other); o.ProxySeenAt != 0 || len(o.Skips) != 0 {
		t.Fatalf("another site's marks: %+v", o)
	}

	if err := st.GuessKind(ctx, site, KindShop, "stripe"); err != nil {
		t.Fatal(err)
	}
	if err := st.ChooseKind(ctx, site, KindContent); err != nil {
		t.Fatal(err)
	}
	if err := st.GuessKind(ctx, site, KindSaaS, ""); err != nil {
		t.Fatal(err)
	}
	if got, _ = st.SetupOf(ctx, site); got.Kind != KindContent || !got.KindChosen || got.ProxySeenAt != 100 {
		t.Fatalf("a chosen kind survives a guess, and the other marks stay: %+v", got)
	}

	if _, err := st.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = st.DB.QueryRow(`SELECT (SELECT count(*) FROM site_setup) + (SELECT count(*) FROM setup_skips)`).Scan(&n)
	if n != 0 {
		t.Fatalf("deleting a site left %d setup rows", n)
	}
}
