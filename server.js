const express = require("express");
const cors = require("cors");

require("./database/database");

const fundRoutes = require("./routes/funds");
const stockRoutes = require("./routes/stocks");
const holdingRoutes = require("./routes/holdings");
const navRoutes = require("./routes/nav");


const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Fund NAV Tracker API is running"
    });
});

app.use("/api/funds", fundRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/holdings", holdingRoutes);
app.use("/api/nav", navRoutes);
const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});