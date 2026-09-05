"""Find routes the UI offers no way into.

Two failure modes, and the second is the one that hid /mock for this long:

  1. NO INBOUND LINK - reachable only by typing the URL.
  2. SELF-REFERENTIAL ONLY - every link into it comes from a page already under
     that same path. /mock was linked from /mock/:id/results and nowhere else,
     so a "does anything link here?" check said yes while a student had no way
     in at all.

Matches both JSX attributes (to="/x") and nav-array entries (to: "/x"); missing
the latter previously produced a false orphan for every sidebar destination.
"""
import re
import io
import os

app = io.open("src/App.tsx", encoding="utf-8").read()
routes = {(r.rstrip("/") or "/") for r in re.findall(r'path="(/[^"*:]*)"', app)}

PATTERNS = [
    r'to="(/[^"]*)"',                     # <Link to="/x">
    r'to:\s*"(/[^"]*)"',                  # { to: "/x" } nav arrays
    r'navigate\(\s*[`"\'](/[^`"\']*)',    # navigate("/x")
    r'to=\{\s*[`"](/[^`"$]*)',            # to={`/x/${id}`}
]

# route -> set of source files linking to it
links = {}
for root, dirs, files in os.walk("src"):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    for f in files:
        if not f.endswith((".tsx", ".ts")):
            continue
        path = os.path.join(root, f).replace("\\", "/")
        text = io.open(path, encoding="utf-8", errors="ignore").read()
        for pat in PATTERNS:
            for m in re.findall(pat, text):
                dest = m.split("?")[0].rstrip("/") or "/"
                links.setdefault(dest, set()).add(path)


def sources_for(route):
    """Every file linking to this route or anything beneath it."""
    out = set()
    for dest, srcs in links.items():
        if dest == route or dest.startswith(route + "/"):
            out |= srcs
    return out


def feature_dir(route):
    """First path segment, e.g. /mock/x -> mock."""
    parts = [p for p in route.split("/") if p]
    return parts[0] if parts else ""


unlinked, self_only = [], []
for r in sorted(routes):
    if r == "/":
        continue
    srcs = sources_for(r)
    srcs = {s for s in srcs if not s.endswith("src/App.tsx")}
    if not srcs:
        unlinked.append(r)
        continue
    feat = feature_dir(r)
    # Does any link come from OUTSIDE this feature's own pages?
    outside = [s for s in srcs if f"/pages/{feat}/" not in s]
    if not outside:
        self_only.append((r, sorted(srcs)))

print(f"routes declared: {len(routes)}\n")
print("NO INBOUND LINK (URL-only):")
for r in unlinked:
    print("  ", r)
print("\nLINKED ONLY FROM INSIDE ITSELF (no way in from the rest of the app):")
for r, srcs in self_only:
    print("  ", r)
    for s in srcs:
        print("       <-", s)
if not self_only:
    print("   none")
