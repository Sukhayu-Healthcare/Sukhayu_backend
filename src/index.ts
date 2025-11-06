import express from "express";
import dotenv from "dotenv";
import { pgConnection } from "./config/postgress.js";
import { mongoConnection } from "./config/mongo.js";

dotenv.config();

if (!process.env.PORT) {
  console.log("PORT not found as enviornment variable");
  process.exit(1);
}
const PORT = Number(process.env.PORT) || 3000;
const app = express();

async function DBConnection() {
  await pgConnection();
  await mongoConnection();
}

DBConnection();
app
  .listen(PORT, () => {
    console.log(`server has started ${PORT}`);
  })
  .on("error", (err) => {
    console.error("failed to start", err);
  });
