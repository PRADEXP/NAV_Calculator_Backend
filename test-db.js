require("dotenv").config();

const db = require("./database/database");

async function testDatabase() {
    try {
        const result = await db.query("SELECT NOW()");

        console.log("✅ Database connected!");
        console.log(result.rows[0]);

    } catch (error) {
        console.error("❌ Database connection failed:");
        console.error(error.message);

    } finally {
        await db.end();
    }
}

testDatabase();