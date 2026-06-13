/**
 * NDLI + Open Library API Proxy
 * ===================================================
 * Uses Open Library's free search API to provide actual eBook results,
 * and supplements with direct NDLI search links for Indian academic content.
 * 
 * Endpoint: /api/ndli?q=<query>&type=<ebook|notebook|all>&page=<num>
 */

import { requireAuth } from "./_verifyToken.js";

const OPEN_LIBRARY_API = "https://openlibrary.org/search.json";

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Authentication: only signed-in users may proxy through our function ──
  const caller = await requireAuth(req, res);
  if (!caller) return; // requireAuth already wrote the 401 response

  const { q, type = "all", page = "1" } = req.query;

  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.status(400).json({ error: "Query parameter 'q' is required (min 2 chars)" });
  }

  try {
    // Build Open Library search URL
    const searchUrl = new URL(OPEN_LIBRARY_API);
    searchUrl.searchParams.set("q", q.trim());
    searchUrl.searchParams.set("page", page);
    searchUrl.searchParams.set("limit", "20");
    searchUrl.searchParams.set("fields", "key,title,author_name,first_publish_year,subject,language,cover_i,edition_count,ebook_access,isbn,publisher,number_of_pages_median");

    // Filter for ebooks only if requested
    if (type === "ebook") {
      searchUrl.searchParams.set("has_fulltext", "true");
    }

    const response = await fetch(searchUrl.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "EduOnx-LearningPlatform/1.0 (educational; contact: support@eduonx.com)",
      },
      signal: AbortSignal.timeout(12000), // 12s timeout
    });

    if (!response.ok) {
      throw new Error(`Open Library API returned ${response.status}`);
    }

    const data = await response.json();

    // Normalize results
    const items = (data.docs || []).map((doc) => {
      const coverId = doc.cover_i;
      const key = doc.key || "";
      const olId = key.replace("/works/", "");
      
      return {
        id: olId || doc.isbn?.[0] || Math.random().toString(36).substring(7),
        title: doc.title || "Untitled",
        author: (doc.author_name || []).join(", ") || "Unknown Author",
        type: doc.ebook_access === "public" ? "Free eBook" : doc.ebook_access === "borrowable" ? "Borrowable" : "Reference",
        description: doc.subject ? doc.subject.slice(0, 3).join(", ") : "",
        thumbnail: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
        url: `https://openlibrary.org${key}`,
        readUrl: doc.ebook_access === "public" || doc.ebook_access === "borrowable" 
          ? `https://openlibrary.org${key}?mode=all#editions-list`
          : null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : null,
        subject: doc.subject ? doc.subject.slice(0, 2).join(", ") : null,
        language: doc.language ? doc.language.map(l => l === "eng" ? "English" : l === "hin" ? "Hindi" : l).join(", ") : "English",
        pages: doc.number_of_pages_median || null,
        editions: doc.edition_count || 0,
        publisher: doc.publisher ? doc.publisher[0] : null,
        hasFullText: doc.ebook_access === "public" || doc.ebook_access === "borrowable",
      };
    });

    const results = {
      query: q,
      page: parseInt(page),
      totalResults: data.numFound || 0,
      items,
      // Always provide NDLI supplementary links
      ndliLinks: {
        schoolSearch: `https://ndl.iitkgp.ac.in/se_search?q=${encodeURIComponent(q.trim())}`,
        higherEdSearch: `https://ndl.iitkgp.ac.in/he_search?q=${encodeURIComponent(q.trim())}`,
        researchSearch: `https://ndl.iitkgp.ac.in/re_search?q=${encodeURIComponent(q.trim())}`,
      },
    };

    // Cache for 10 minutes
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json(results);
  } catch (error) {
    console.error("[NDLI/OpenLibrary API] Error:", error);

    // Return fallback with direct search links
    return res.status(200).json({
      query: q,
      page: parseInt(page),
      totalResults: 0,
      items: [],
      fallback: true,
      ndliLinks: {
        schoolSearch: `https://ndl.iitkgp.ac.in/se_search?q=${encodeURIComponent(q.trim())}`,
        higherEdSearch: `https://ndl.iitkgp.ac.in/he_search?q=${encodeURIComponent(q.trim())}`,
        researchSearch: `https://ndl.iitkgp.ac.in/re_search?q=${encodeURIComponent(q.trim())}`,
      },
      message: "Search results from Open Library are temporarily unavailable. Use the NDLI links below.",
    });
  }
}
