import { Client } from "pg";

let pgClient: Client | null = null;

/* -----------------------------------------
   🔌 Connect to PostgreSQL
----------------------------------------- */
export async function pgConnection() {
  try {
    const PG_URL = process.env.PG_URL;

    if (!PG_URL) {
      throw new Error("Missing PostgreSQL environment variable PG_URL");
    }

    pgClient = new Client({
      connectionString: PG_URL,
    });

    await pgClient.connect();
    console.log("PostgreSQL connected successfully");

    return pgClient;

  } catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    process.exit(1);
  }
}

/* -----------------------------------------
   📌 Get existing pgClient (after connection)
----------------------------------------- */
export function getPgClient() {
  if (!pgClient) {
    throw new Error("PostgreSQL client not initialized. Call pgConnection() first.");
  }
  return pgClient;
}
