import { Client } from "pg";

let client : Client | null = null

export async function pgConnection(){
try {
    const  PG_URL  = process.env.PG_URL;
    if (!PG_URL) {
        throw new Error("Missing PostgreSQL environment variables");
      }
      client = new Client({
        connectionString : PG_URL
      });
  
      await client.connect();
      console.log("PostgreSQL connected successfully");
  
      return client;
} catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    process.exit(1);
}

}