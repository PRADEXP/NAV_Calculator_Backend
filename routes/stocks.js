const express = require("express");
const db = require("../database/database");

const router = express.Router();


// =====================================================
// GET ALL STOCKS
// =====================================================

router.get("/", async (req, res) => {

    try {

        const result = await db.query(
            `
            SELECT *
            FROM stocks
            ORDER BY company_name
            `
        );

        res.json(result.rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// SEARCH STOCKS
// =====================================================

router.get("/search", async (req, res) => {

    try {

        const query = req.query.q;

        if (!query) {

            return res.status(400).json({
                error: "Search query is required"
            });
        }


        const searchTerm = `%${query}%`;


        const result = await db.query(
            `
            SELECT *
            FROM stocks
            WHERE company_name ILIKE $1
               OR symbol ILIKE $1
            ORDER BY company_name
            `,
            [searchTerm]
        );


        res.json(result.rows);


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// ADD STOCK
// =====================================================

router.post("/", async (req, res) => {

    try {

        const {
            company_name,
            symbol,
            exchange
        } = req.body;


        // Validate

        if (
            !company_name ||
            !symbol ||
            !exchange
        ) {

            return res.status(400).json({
                error:
                    "company_name, symbol and exchange are required"
            });
        }


        const cleanCompanyName =
            company_name.trim();

        const cleanSymbol =
            symbol.trim().toUpperCase();

        const cleanExchange =
            exchange.trim().toUpperCase();


        // Insert stock

        const result = await db.query(
            `
            INSERT INTO stocks
            (
                company_name,
                symbol,
                exchange
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                cleanCompanyName,
                cleanSymbol,
                cleanExchange
            ]
        );


        res.status(201).json(
            result.rows[0]
        );


    } catch (error) {

        console.error(error);


        // PostgreSQL UNIQUE constraint

        if (error.code === "23505") {

            return res.status(409).json({
                error: "Stock already exists"
            });
        }


        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// UPDATE STOCK
// =====================================================

router.put("/:id", async (req, res) => {

    try {

        const { id } = req.params;

        const {
            company_name,
            symbol,
            exchange
        } = req.body;


        // Validate

        if (
            !company_name ||
            !symbol ||
            !exchange
        ) {

            return res.status(400).json({
                error: "All fields are required"
            });
        }


        const cleanCompanyName =
            company_name.trim();

        const cleanSymbol =
            symbol.trim().toUpperCase();

        const cleanExchange =
            exchange.trim().toUpperCase();


        // Update

        const result = await db.query(
            `
            UPDATE stocks
            SET
                company_name = $1,
                symbol = $2,
                exchange = $3
            WHERE id = $4
            RETURNING *
            `,
            [
                cleanCompanyName,
                cleanSymbol,
                cleanExchange,
                id
            ]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Stock not found"
            });
        }


        res.json(
            result.rows[0]
        );


    } catch (error) {

        console.error(error);


        if (error.code === "23505") {

            return res.status(409).json({
                error: "Stock already exists"
            });
        }


        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// DELETE STOCK
// =====================================================

router.delete("/:id", async (req, res) => {

    try {

        const { id } = req.params;


        // =================================================
        // CHECK WHETHER STOCK IS USED BY A FUND
        // =================================================

        const holdingResult = await db.query(
            `
            SELECT id
            FROM fund_holdings
            WHERE stock_id = $1
            LIMIT 1
            `,
            [id]
        );


        if (holdingResult.rows.length > 0) {

            return res.status(400).json({
                error:
                    "This stock is currently used by a fund. Remove it from the fund first."
            });
        }


        // =================================================
        // DELETE STOCK
        // =================================================

        const result = await db.query(
            `
            DELETE FROM stocks
            WHERE id = $1
            RETURNING *
            `,
            [id]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Stock not found"
            });
        }


        res.json({
            message:
                "Stock deleted successfully"
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


module.exports = router;