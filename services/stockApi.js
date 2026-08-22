const {
    getQuoteBatch
} = require("./stockApi/yahoo");


async function getStockPrices(symbols) {

    // No symbols
    if (!symbols || symbols.length === 0) {
        return {
            stocks: [],
            timestamp: new Date().toISOString()
        };
    }


    // -------------------------------------------------
    // Convert database symbols to Yahoo Finance symbols
    // -------------------------------------------------
    //
    // TCS       -> TCS.NS
    // INFY      -> INFY.NS
    // RELIANCE  -> RELIANCE.NS
    //
    // If the symbol already has .NS or .BO,
    // keep it unchanged.
    //

    const yahooSymbols = symbols.map((symbol) => {

        const cleanSymbol =
            String(symbol)
                .trim()
                .toUpperCase();

        if (
            cleanSymbol.endsWith(".NS") ||
            cleanSymbol.endsWith(".BO")
        ) {
            return cleanSymbol;
        }

        return `${cleanSymbol}.NS`;
    });


    // -------------------------------------------------
    // Get quotes directly from Yahoo Finance
    // -------------------------------------------------

    const quotes =
        await getQuoteBatch(yahooSymbols);


    // -------------------------------------------------
    // Convert Yahoo response to the format expected
    // by routes/nav.js
    // -------------------------------------------------

    const stocks = symbols.map((symbol, index) => {

        const yahooSymbol =
            yahooSymbols[index];

        const quote =
            quotes[yahooSymbol];


        // Yahoo did not return this stock
        if (!quote) {

            return {
                ticker: symbol,
                last_price: null,
                percent_change: null
            };
        }


        return {

            // Must match the symbol in your database
            ticker: symbol,

            // Current stock price
            last_price:
                quote.lastPrice ?? null,

            // Percentage change
            percent_change:
                quote.percentChange ?? null,

            // Additional information
            company_name:
                quote.companyName ?? null,

            volume:
                quote.volume ?? null,

            market_cap:
                quote.marketCap ?? null,

            pe_ratio:
                quote.peRatio ?? null
        };

    });


    // -------------------------------------------------
    // Return response
    // -------------------------------------------------

    return {

        stocks,

        timestamp:
            new Date().toISOString()

    };
}


module.exports = {
    getStockPrices
};