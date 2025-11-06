import express from "express";
import dotenv from "dotenv";
import { pgConnection } from "./config/postgress.js";
import { mongoConnection } from "./config/mongo.js";
import { asha } from "./routes/asha.routes.js";

dotenv.config();
const app = express();
app.use(express.json());

if (!process.env.PORT) {
  console.log("PORT not found as enviornment variable");
  process.exit(1);
}
const PORT = Number(process.env.PORT) || 3000;

async function DBConnection() {
  await pgConnection();
  await mongoConnection();
}

DBConnection();

app.use("/api/v1/asha", asha);
app
  .listen(PORT, () => {
    console.log(`server has started ${PORT}`);
  })
  .on("error", (err) => {
    console.error("failed to start", err);
  });
