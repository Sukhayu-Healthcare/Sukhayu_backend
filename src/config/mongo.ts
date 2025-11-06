import mongoose from "mongoose";
export async function mongoConnection(): Promise<void> {
  try {
    if (!process.env.MONGO_URL) {
      console.log("Please specify MongoURL");
      throw new Error("please specify MongoURL");
    }
    await mongoose.connect(process.env.MONGO_URL);
    console.log("mognoDB is connected");
  } catch (error) {
    console.error(`Error in connecting to Mongo`);
    process.exit(1);
  }
}
