import { Client } from "pg";

 let pgclient : Client | null = null

export async function pgConnection(){
try {
    const  PG_URL  = process.env.PG_URL;
    if (!PG_URL) {
        throw new Error("Missing PostgreSQL environment variables");
      }
      pgclient = new Client({
        connectionString : PG_URL
      });
  
      await pgclient.connect();
      console.log("PostgreSQL connected successfully");
      
      return pgclient;
} catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    process.exit(1);
}


}

export function getPgClinent(){
  if(!pgclient)throw new Error(`No pgClient ${Error}`)
    return pgclient
}
