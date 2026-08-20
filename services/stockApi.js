const STOCK_API_URL =
    process.env.STOCK_API_URL || "http://localhost:8787";

async function getStockPrices(symbols) {

    if (symbols.length === 0) {
        return [];
    }

    const symbolList = symbols.join(",");

    const url =
        `${STOCK_API_URL}/stock/list?symbols=${encodeURIComponent(symbolList)}&res=num`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Stock API returned ${response.status}`
        );
    }

    return await response.json();
}

module.exports = {
    getStockPrices
};