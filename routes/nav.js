const express = require("express");
const db = require("../database/database");

const { getStockPrices } = require("../services/stockApi");

const router = express.Router();


// =====================================================
// GET FUND NAV
// =====================================================

router.get("/:fundId", async (req, res) => {

    try {

        const fundId = req.params.fundId;


        // =================================================
        // GET FUND
        // =================================================

        const fundResult = await db.query(
            `
            SELECT *
            FROM funds
            WHERE id = $1
            `,
            [fundId]
        );


        if (fundResult.rows.length === 0) {

            return res.status(404).json({
                error: "Fund not found"
            });
        }


        const fund = fundResult.rows[0];


        // =================================================
        // GET FUND HOLDINGS
        // =================================================

        const holdingsResult = await db.query(
            `
            SELECT
                fh.id,
                fh.allocation_percentage,
                s.company_name,
                s.symbol,
                s.exchange
            FROM fund_holdings fh
            JOIN stocks s
                ON fh.stock_id = s.id
            WHERE fh.fund_id = $1
            ORDER BY s.company_name
            `,
            [fundId]
        );


        const holdings = holdingsResult.rows;


        // =================================================
        // NO HOLDINGS
        // =================================================

        if (holdings.length === 0) {

            const baseNav =
                Number(fund.base_nav);


            return res.json({

                fund: {
                    id: fund.id,
                    name: fund.name,
                    base_nav: baseNav
                },

                estimated_nav: baseNav,

                estimated_change_percent: 0,

                holdings: [],

                market_data_timestamp: null,

                timestamp:
                    new Date().toISOString()
            });
        }


        // =================================================
        // GET STOCK SYMBOLS
        // =================================================

        const symbols =
            holdings.map(
                holding => holding.symbol
            );


        // =================================================
        // CALL STOCK API
        // =================================================

        const stockResult =
            await getStockPrices(symbols);


        const stockData =
            stockResult.stocks;


        if (!Array.isArray(stockData)) {

            return res.status(500).json({

                error:
                    "Invalid response from stock API",

                response:
                    stockResult
            });
        }


        // =================================================
        // CALCULATE WEIGHTED CHANGE
        // =================================================

        let weightedChange = 0;


        const updatedHoldings =
            holdings.map(holding => {

                const stock =
                    stockData.find(
                        item =>
                            item.ticker ===
                            holding.symbol
                    );


                // -----------------------------------------
                // Stock data not available
                // -----------------------------------------

                if (!stock) {

                    return {

                        ...holding,

                        current_price: null,

                        percent_change: null,

                        contribution: null
                    };
                }


                const allocation =
                    Number(
                        holding.allocation_percentage
                    );


                const percentChange =
                    Number(
                        stock.percent_change || 0
                    );


                // Weighted contribution

                const contribution =
                    (allocation *
                        percentChange) / 100;


                weightedChange +=
                    contribution;


                return {

                    ...holding,

                    current_price:
                        stock.last_price,

                    percent_change:
                        percentChange,

                    contribution:
                        Number(
                            contribution.toFixed(4)
                        )
                };

            });


        // =================================================
        // CALCULATE ESTIMATED NAV
        // =================================================

        const baseNav =
            Number(fund.base_nav);


        const estimatedNav =
            baseNav *
            (1 + weightedChange / 100);


        // =================================================
        // RESPONSE
        // =================================================

        res.json({

            fund: {

                id: fund.id,

                name: fund.name,

                base_nav: baseNav
            },


            estimated_nav:
                Number(
                    estimatedNav.toFixed(4)
                ),


            estimated_change_percent:
                Number(
                    weightedChange.toFixed(4)
                ),


            holdings:
                updatedHoldings,


            market_data_timestamp:
                stockResult.timestamp,


            timestamp:
                new Date().toISOString()
        });


    } catch (error) {

        console.error(
            "NAV calculation error:",
            error
        );


        res.status(500).json({

            error:
                error.message
        });
    }
});


module.exports = router;