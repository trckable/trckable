// The page of every site was /all before it was /sites: old links still land there.
if (location.pathname === '/all') history.replaceState(null, '', '/sites' + location.search + location.hash)
