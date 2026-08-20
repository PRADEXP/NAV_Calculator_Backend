const express = require("express");
const db = require("../database/database");

const router = express.Router();


// =====================================================
// GET ALL HOLDINGS FOR A FUND
// =====================================================

router.get("/fund/:fundId", async (req, res) => {

    try {

        const result = await db.query(
            `
            SELECT
                fh.id,
                fh.fund_id,
                fh.stock_id,
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
            [req.params.fundId]
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
// ADD STOCK TO FUND
// =====================================================

router.post("/", async (req, res) => {

    try {

        const {
            fund_id,
            stock_id,
            allocation_percentage
        } = req.body;


        // Validate required fields

        if (
            !fund_id ||
            !stock_id ||
            allocation_percentage === undefined
        ) {

            return res.status(400).json({
                error:
                    "fund_id, stock_id and allocation_percentage are required"
            });
        }


        const allocation =
            Number(allocation_percentage);


        // Validate allocation

        if (
            allocation <= 0 ||
            allocation > 100
        ) {

            return res.status(400).json({
                error:
                    "Allocation must be between 0 and 100"
            });
        }


        // =================================================
        // CHECK FUND
        // =================================================

        const fundResult = await db.query(
            `
            SELECT *
            FROM funds
            WHERE id = $1
            `,
            [fund_id]
        );


        if (fundResult.rows.length === 0) {

            return res.status(404).json({
                error: "Fund not found"
            });
        }


        // =================================================
        // CHECK STOCK
        // =================================================

        const stockResult = await db.query(
            `
            SELECT *
            FROM stocks
            WHERE id = $1
            `,
            [stock_id]
        );


        if (stockResult.rows.length === 0) {

            return res.status(404).json({
                error: "Stock not found"
            });
        }


        // =================================================
        // CHECK CURRENT ALLOCATION
        // =================================================

        const currentResult = await db.query(
            `
            SELECT
                COALESCE(
                    SUM(allocation_percentage),
                    0
                ) AS total
            FROM fund_holdings
            WHERE fund_id = $1
            `,
            [fund_id]
        );


        const currentAllocation =
            Number(currentResult.rows[0].total);


        const newTotal =
            currentAllocation + allocation;


        if (newTotal > 100) {

            return res.status(400).json({

                error:
                    `Total allocation cannot exceed 100%. ` +
                    `Current: ${currentAllocation}%`

            });
        }


        // =================================================
        // INSERT HOLDING
        // =================================================

        const result = await db.query(
            `
            INSERT INTO fund_holdings
            (
                fund_id,
                stock_id,
                allocation_percentage
            )
            VALUES ($1, $2, $3)
            RETURNING id
            `,
            [
                fund_id,
                stock_id,
                allocation
            ]
        );


        const holdingId =
            result.rows[0].id;


        // =================================================
        // GET CREATED HOLDING
        // =================================================

        const holdingResult = await db.query(
            `
            SELECT
                fh.id,
                fh.fund_id,
                fh.stock_id,
                fh.allocation_percentage,
                s.company_name,
                s.symbol,
                s.exchange
            FROM fund_holdings fh
            JOIN stocks s
                ON fh.stock_id = s.id
            WHERE fh.id = $1
            `,
            [holdingId]
        );


        res.status(201).json(
            holdingResult.rows[0]
        );


    } catch (error) {

        console.error(error);


        // PostgreSQL UNIQUE constraint
        if (error.code === "23505") {

            return res.status(409).json({
                error:
                    "This stock is already added to this fund"
            });
        }


        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// DELETE HOLDING
// =====================================================

router.delete("/:id", async (req, res) => {

    try {

        const holdingId =
            req.params.id;


        const result = await db.query(
            `
            DELETE FROM fund_holdings
            WHERE id = $1
            RETURNING *
            `,
            [holdingId]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Holding not found"
            });
        }


        res.json({
            message:
                "Holding removed successfully"
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// DELETE FUND + HOLDINGS
// =====================================================
//
// NOTE:
// Your PostgreSQL table has:
//
// ON DELETE CASCADE
//
// Therefore we only need to delete the fund.
// PostgreSQL automatically deletes its holdings.
// =====================================================

router.delete("/fund/:fundId", async (req, res) => {

    try {

        const fundId =
            req.params.fundId;


        const result = await db.query(
            `
            DELETE FROM funds
            WHERE id = $1
            RETURNING *
            `,
            [fundId]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Fund not found"
            });
        }


        res.json({
            message:
                "Fund and its holdings deleted successfully"
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// =====================================================
// UPDATE HOLDING ALLOCATION
// =====================================================

router.put("/:id", async (req, res) => {

    try {

        const holdingId =
            req.params.id;


        const {
            allocation_percentage
        } = req.body;


        const allocation =
            Number(allocation_percentage);


        // Validate allocation

        if (
            !allocation ||
            allocation <= 0 ||
            allocation > 200
        ) {

            return res.status(400).json({
                error:
                    "Allocation must be between 0 and 100"
            });
        }


        // =================================================
        // FIND HOLDING
        // =================================================

        const holdingResult = await db.query(
            `
            SELECT *
            FROM fund_holdings
            WHERE id = $1
            `,
            [holdingId]
        );


        if (holdingResult.rows.length === 0) {

            return res.status(404).json({
                error: "Holding not found"
            });
        }


        const holding =
            holdingResult.rows[0];


        // =================================================
        // GET OTHER ALLOCATIONS
        // =================================================

        const currentResult = await db.query(
            `
            SELECT
                COALESCE(
                    SUM(allocation_percentage),
                    0
                ) AS total
            FROM fund_holdings
            WHERE fund_id = $1
            AND id != $2
            `,
            [
                holding.fund_id,
                holdingId
            ]
        );


        const otherAllocation =
            Number(currentResult.rows[0].total);


        // =================================================
        // CHECK TOTAL
        // =================================================

        const newTotal =
            otherAllocation + allocation;


        if (newTotal > 100) {

            return res.status(400).json({

                error:
                    `Total allocation cannot exceed 100%. ` +
                    `Other stocks: ${otherAllocation}%. ` +
                    `Remaining: ${(100 - otherAllocation).toFixed(2)}%`

            });
        }


        // =================================================
        // UPDATE
        // =================================================

        const result = await db.query(
            `
            UPDATE fund_holdings
            SET allocation_percentage = $1
            WHERE id = $2
            RETURNING *
            `,
            [
                allocation,
                holdingId
            ]
        );


        // =================================================
        // GET UPDATED HOLDING WITH STOCK
        // =================================================

        const updatedResult = await db.query(
            `
            SELECT
                fh.id,
                fh.fund_id,
                fh.stock_id,
                fh.allocation_percentage,
                s.company_name,
                s.symbol,
                s.exchange
            FROM fund_holdings fh
            JOIN stocks s
                ON fh.stock_id = s.id
            WHERE fh.id = $1
            `,
            [holdingId]
        );


        res.json(
            updatedResult.rows[0]
        );


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


module.exports = router;