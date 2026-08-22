// yahoo.js
// Yahoo Finance helpers for the Express/Node.js backend.
// No extra npm dependency is required; uses built-in fetch.

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Module-level cache.
// The cookie + crumb are reused for about 50 minutes.
let crumbCache = {
    crumb: null,
    cookie: null,
    expiresAt: 0,
};

// ---------------------------------------------------------
// Yahoo Finance authentication
// ---------------------------------------------------------

async function getCrumb(forceRefresh = false) {
    if (
        !forceRefresh &&
        crumbCache.crumb &&
        crumbCache.cookie &&
        Date.now() < crumbCache.expiresAt
    ) {
        return crumbCache;
    }

    try {
        // First request gets the Yahoo cookie.
        const cookieRes = await fetch("https://fc.yahoo.com", {
            headers: {
                "User-Agent": UA,
            },
        });

        const setCookie =
            cookieRes.headers.get("set-cookie") || "";

        const cookie = setCookie.split(";")[0] || "";

        if (!cookie) {
            console.error("Yahoo Finance: cookie was not received");
            return {
                crumb: null,
                cookie: null,
                expiresAt: 0,
            };
        }

        // Second request gets the crumb.
        const crumbRes = await fetch(
            "https://query1.finance.yahoo.com/v1/test/getcrumb",
            {
                headers: {
                    "User-Agent": UA,
                    Cookie: cookie,
                },
            }
        );

        if (!crumbRes.ok) {
            console.error(
                "Yahoo Finance: failed to get crumb:",
                crumbRes.status
            );

            return {
                crumb: null,
                cookie,
                expiresAt: 0,
            };
        }

        const crumb = (await crumbRes.text()).trim();

        if (!crumb) {
            console.error("Yahoo Finance: empty crumb received");

            return {
                crumb: null,
                cookie,
                expiresAt: 0,
            };
        }

        crumbCache = {
            crumb,
            cookie,
            expiresAt: Date.now() + 50 * 60 * 1000,
        };

        return crumbCache;
    } catch (error) {
        console.error(
            "Yahoo Finance crumb error:",
            error.message
        );

        return {
            crumb: null,
            cookie: null,
            expiresAt: 0,
        };
    }
}


// ---------------------------------------------------------
// Authenticated Yahoo request
// ---------------------------------------------------------

async function yahooFetchAuthed(buildUrl) {
    let { crumb, cookie } = await getCrumb();

    if (!crumb || !cookie) {
        return null;
    }

    let res;

    try {
        res = await fetch(buildUrl(crumb), {
            headers: {
                "User-Agent": UA,
                Cookie: cookie,
            },
        });
    } catch (error) {
        console.error(
            "Yahoo Finance request error:",
            error.message
        );

        return null;
    }

    // If authentication expired, refresh cookie + crumb once.
    if (res.status === 401) {
        console.log(
            "Yahoo Finance authentication expired. Refreshing crumb..."
        );

        ({ crumb, cookie } = await getCrumb(true));

        if (!crumb || !cookie) {
            return null;
        }

        try {
            res = await fetch(buildUrl(crumb), {
                headers: {
                    "User-Agent": UA,
                    Cookie: cookie,
                },
            });
        } catch (error) {
            console.error(
                "Yahoo Finance retry error:",
                error.message
            );

            return null;
        }
    }

    return res;
}


// ---------------------------------------------------------
// Helper
// ---------------------------------------------------------

const raw = (field) => {
    if (field && typeof field === "object") {
        return field.raw ?? null;
    }

    return field ?? null;
};


// ---------------------------------------------------------
// NSE autocomplete
// ---------------------------------------------------------

async function tryNseAutocomplete(query) {
    try {
        const headers = {
            "User-Agent": UA,
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.nseindia.com/",
            "X-Requested-With": "XMLHttpRequest",
        };

        // Get NSE cookie first.
        const homeRes = await fetch(
            "https://www.nseindia.com",
            {
                headers,
                signal: AbortSignal.timeout(5000),
            }
        );

        const cookie =
            (homeRes.headers.get("set-cookie") || "")
                .split(";")[0];

        // NSE sometimes requires a small delay.
        await new Promise((resolve) =>
            setTimeout(resolve, 1000)
        );

        const url =
            "https://www.nseindia.com/api/search/autocomplete" +
            `?q=${encodeURIComponent(query)}`;

        const res = await fetch(url, {
            headers: {
                ...headers,
                Cookie: cookie,
            },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
            return [];
        }

        const data = await res.json();

        return (data.symbols || [])
            .filter(
                (item) =>
                    item.result_sub_type === "equity"
            )
            .map((item) => ({
                symbol: item.symbol,
                company_name: item.symbol_info,
                listing_date: item.listing_date,
                source: "nse_api",
            }));
    } catch (error) {
        // NSE failures should never break search.
        console.log(
            "NSE autocomplete unavailable:",
            error.message
        );

        return [];
    }
}


// ---------------------------------------------------------
// Direct Yahoo search
// ---------------------------------------------------------
// Used when Yahoo's search endpoint does not find an exact
// ticker but the supplied query itself may be a symbol.
// ---------------------------------------------------------

async function searchYahooDirect(query) {
    const symbol = query
        .toUpperCase()
        .replace(/\s+/g, "");

    if (!symbol) {
        return [];
    }

    const detail =
        await getStockDetail(`${symbol}.NS`);

    if (!detail) {
        return [];
    }

    return [
        {
            symbol,
            company_name: detail.companyName,
            sector: detail.sector,
            industry: detail.industry,
            source: "yahoo_direct",
        },
    ];
}


// ---------------------------------------------------------
// Yahoo Finance search
// ---------------------------------------------------------

async function searchYahoo(query) {
    try {
        const url =
            "https://query1.finance.yahoo.com/v1/finance/search" +
            `?q=${encodeURIComponent(query)}` +
            "&quotesCount=15";

        const res = await fetch(url, {
            headers: {
                "User-Agent": UA,
            },
        });

        if (!res.ok) {
            console.error(
                "Yahoo search failed:",
                res.status
            );

            return [];
        }

        const data = await res.json();

        return (data.quotes || [])
            .filter(
                (q) =>
                    q.symbol &&
                    (
                        q.symbol.endsWith(".NS") ||
                        q.symbol.endsWith(".BO")
                    )
            )
            .map((q) => ({
                symbol: q.symbol.replace(
                    /\.(NS|BO)$/,
                    ""
                ),

                company_name:
                    q.longname ||
                    q.shortname ||
                    q.symbol,

                sector: q.sector || "N/A",

                industry: q.industry || "N/A",

                source: "yahoo",
            }));
    } catch (error) {
        console.error(
            "Yahoo search error:",
            error.message
        );

        return [];
    }
}


// ---------------------------------------------------------
// Get detailed information for one stock
// ---------------------------------------------------------

async function getStockDetail(tickerSymbol) {
    const modules =
        "price,summaryDetail,defaultKeyStatistics,assetProfile";

    const res = await yahooFetchAuthed(
        (crumb) =>
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" +
            `${encodeURIComponent(tickerSymbol)}` +
            `?modules=${modules}` +
            `&crumb=${encodeURIComponent(crumb)}`
    );

    if (!res) {
        return null;
    }

    if (!res.ok) {
        console.error(
            `Yahoo detail request failed for ${tickerSymbol}:`,
            res.status
        );

        return null;
    }

    try {
        const data = await res.json();

        const result =
            data?.quoteSummary?.result?.[0];

        if (!result) {
            return null;
        }

        const {
            price = {},
            summaryDetail = {},
            defaultKeyStatistics = {},
            assetProfile = {},
        } = result;

        // If price isn't available, the stock isn't usable.
        if (
            raw(price.regularMarketPrice) === null
        ) {
            return null;
        }

        return {
            companyName:
                price.longName ||
                price.shortName ||
                tickerSymbol,

            currency:
                price.currency || "INR",

            lastPrice:
                raw(price.regularMarketPrice),

            change:
                raw(price.regularMarketChange),

            percentChange:
                raw(price.regularMarketChangePercent) !==
                null
                    ? raw(
                        price.regularMarketChangePercent
                    ) * 100
                    : null,

            previousClose:
                raw(price.regularMarketPreviousClose),

            open:
                raw(price.regularMarketOpen) ??
                raw(summaryDetail.open),

            dayHigh:
                raw(price.regularMarketDayHigh),

            dayLow:
                raw(price.regularMarketDayLow),

            yearHigh:
                raw(summaryDetail.fiftyTwoWeekHigh),

            yearLow:
                raw(summaryDetail.fiftyTwoWeekLow),

            volume:
                raw(price.regularMarketVolume),

            marketCap:
                raw(price.marketCap) ??
                raw(summaryDetail.marketCap),

            peRatio:
                raw(summaryDetail.trailingPE),

            dividendYield:
                raw(summaryDetail.dividendYield) !==
                null
                    ? raw(
                        summaryDetail.dividendYield
                    ) * 100
                    : null,

            bookValue:
                raw(defaultKeyStatistics.bookValue),

            eps:
                raw(defaultKeyStatistics.trailingEps),

            sector:
                assetProfile.sector || "N/A",

            industry:
                assetProfile.industry || "N/A",

            lastUpdateEpoch:
                raw(price.regularMarketTime),
        };
    } catch (error) {
        console.error(
            "Yahoo detail parsing error:",
            error.message
        );

        return null;
    }
}


// ---------------------------------------------------------
// Batch quote
// ---------------------------------------------------------
// Used by /stock/list.
// ---------------------------------------------------------

async function getQuoteBatch(tickerSymbols) {
    if (
        !Array.isArray(tickerSymbols) ||
        tickerSymbols.length === 0
    ) {
        return {};
    }

    const res = await yahooFetchAuthed(
        (crumb) =>
            "https://query1.finance.yahoo.com/v7/finance/quote" +
            `?symbols=${encodeURIComponent(
                tickerSymbols.join(",")
            )}` +
            `&crumb=${encodeURIComponent(crumb)}`
    );

    if (!res) {
        return {};
    }

    if (!res.ok) {
        console.error(
            "Yahoo batch quote failed:",
            res.status
        );

        return {};
    }

    try {
        const data = await res.json();

        const byTicker = {};

        for (
            const q of
            data?.quoteResponse?.result || []
        ) {
            byTicker[q.symbol] = {
                companyName:
                    q.longName ||
                    q.shortName ||
                    q.symbol,

                lastPrice:
                    q.regularMarketPrice ?? null,

                change:
                    q.regularMarketChange ?? null,

                percentChange:
                    q.regularMarketChangePercent ??
                    null,

                volume:
                    q.regularMarketVolume ?? null,

                marketCap:
                    q.marketCap ?? null,

                peRatio:
                    q.trailingPE ?? null,
            };
        }

        return byTicker;
    } catch (error) {
        console.error(
            "Yahoo batch quote parsing error:",
            error.message
        );

        return {};
    }
}


// ---------------------------------------------------------
// CommonJS exports
// ---------------------------------------------------------

module.exports = {
    tryNseAutocomplete,
    searchYahooDirect,
    searchYahoo,
    getStockDetail,
    getQuoteBatch,
};