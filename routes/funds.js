const express = require("express");
const db = require("../database/database");

const router = express.Router();


// ==========================================
// GET ALL FUNDS
// ==========================================

router.get("/", async (req, res) => {
    try {

        const result = await db.query(
            `
            SELECT *
            FROM funds
            ORDER BY id DESC
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


// ==========================================
// GET ONE FUND
// ==========================================

router.get("/:id", async (req, res) => {

    try {

        const result = await db.query(
            `
            SELECT *
            FROM funds
            WHERE id = $1
            `,
            [req.params.id]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Fund not found"
            });
        }


        res.json(result.rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ==========================================
// CREATE FUND
// ==========================================

router.post("/", async (req, res) => {

    try {

        const {
            name,
            base_nav,
            base_nav_date
        } = req.body;


        if (
            !name ||
            base_nav === undefined ||
            !base_nav_date
        ) {

            return res.status(400).json({
                error:
                    "name, base_nav and base_nav_date are required"
            });
        }


        const result = await db.query(
            `
            INSERT INTO funds
            (
                name,
                base_nav,
                base_nav_date
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                name.trim(),
                Number(base_nav),
                base_nav_date
            ]
        );


        res.status(201).json(
            result.rows[0]
        );


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ==========================================
// DELETE FUND
// ==========================================

router.delete("/:id", async (req, res) => {

    try {

        const result = await db.query(
            `
            DELETE FROM funds
            WHERE id = $1
            RETURNING *
            `,
            [req.params.id]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Fund not found"
            });
        }


        res.json({
            message: "Fund deleted successfully"
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ==========================================
// UPDATE FUND
// ==========================================

router.put("/:id", async (req, res) => {

    try {

        const { id } = req.params;

        const {
            name,
            base_nav,
            base_nav_date
        } = req.body;


        if (
            !name ||
            base_nav === undefined ||
            !base_nav_date
        ) {

            return res.status(400).json({
                error: "All fields are required"
            });
        }


        // Check if fund exists

        const existingFund = await db.query(
            `
            SELECT *
            FROM funds
            WHERE id = $1
            `,
            [id]
        );


        if (existingFund.rows.length === 0) {

            return res.status(404).json({
                error: "Fund not found"
            });
        }


        // Update fund

        const result = await db.query(
            `
            UPDATE funds
            SET
                name = $1,
                base_nav = $2,
                base_nav_date = $3
            WHERE id = $4
            RETURNING *
            `,
            [
                name.trim(),
                Number(base_nav),
                base_nav_date,
                id
            ]
        );


        res.json(
            result.rows[0]
        );


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


module.exports = router;